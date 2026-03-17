import { randomUUID } from 'node:crypto';
import prisma from './prisma';
import {
  buildSignals,
  filterRealSnapshots,
  type DashboardSnapshot,
  type Signal,
} from './dashboardSignals';
import { fetchDashboardSnapshots } from './dashboardData';

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM?.trim() ?? '';
const APP_BASE_URL =
  process.env.APP_BASE_URL?.trim() ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

type NotificationSummary = {
  configured: boolean;
  usersChecked: number;
  usersSkipped: number;
  emailsSent: number;
  signalsSent: number;
};

type NotificationRecipient = {
  id: string;
  email: string;
  displayName: string | null;
  watchlist: Array<{
    trackedItemId: string;
    item: {
      type: string;
    };
  }>;
};

type ReservedSignal = Signal & {
  trackedItemId: string;
};

export async function sendNewSignalEmails(): Promise<NotificationSummary> {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return {
      configured: false,
      usersChecked: 0,
      usersSkipped: 0,
      emailsSent: 0,
      signalsSent: 0,
    };
  }

  const recipients = await prisma.user.findMany({
    where: {
      emailNotificationsEnabled: true,
      watchlist: {
        some: {
          item: {
            type: 'CARD',
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      watchlist: {
        select: {
          trackedItemId: true,
          item: {
            select: {
              type: true,
            },
          },
        },
      },
    },
  });

  if (!recipients.length) {
    return {
      configured: true,
      usersChecked: 0,
      usersSkipped: 0,
      emailsSent: 0,
      signalsSent: 0,
    };
  }

  const snapshots = filterRealSnapshots(await fetchDashboardSnapshots());
  let usersSkipped = 0;
  let emailsSent = 0;
  let signalsSent = 0;

  for (const recipient of recipients) {
    const watchlistedCardIds = new Set(
      recipient.watchlist
        .filter((entry) => entry.item.type === 'CARD')
        .map((entry) => entry.trackedItemId),
    );

    if (!watchlistedCardIds.size) {
      usersSkipped += 1;
      continue;
    }

    const userSignals = buildSignals(
      snapshots.filter((snapshot) => watchlistedCardIds.has(snapshot.trackedItemId)),
      0,
    );

    if (!userSignals.length) {
      usersSkipped += 1;
      continue;
    }

    const reservationToken = randomUUID();
    const reservedSignals = await reserveSignals(recipient.id, userSignals, snapshots, reservationToken);
    if (!reservedSignals.length) {
      usersSkipped += 1;
      continue;
    }

    try {
      await sendSignalEmail(recipient, reservedSignals);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email failure';
      await markReservationFailed(recipient.id, reservationToken, message);
      usersSkipped += 1;
      continue;
    }

    try {
      await markReservationSent(recipient.id, reservationToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delivery update failure';
      console.error('[Email Notifications] failed to mark reservation sent', {
        recipientId: recipient.id,
        reservationToken,
        error: message,
      });
    }

    emailsSent += 1;
    signalsSent += reservedSignals.length;
  }

  return {
    configured: true,
    usersChecked: recipients.length,
    usersSkipped,
    emailsSent,
    signalsSent,
  };
}

async function reserveSignals(
  userId: string,
  signals: Signal[],
  snapshots: DashboardSnapshot[],
  reservationToken: string,
) {
  const reservableSignals = signals
    .map((signal) => {
      const trackedItemId = getTrackedItemIdForSignal(signal, snapshots);
      return trackedItemId ? { ...signal, trackedItemId } : null;
    })
    .filter((signal): signal is ReservedSignal => Boolean(signal));

  if (!reservableSignals.length) {
    return [];
  }

  const existingDeliveries = await prisma.notificationDelivery.findMany({
    where: {
      userId,
      signalKey: {
        in: reservableSignals.map((signal) => signal.id),
      },
    },
    select: {
      signalKey: true,
      status: true,
    },
  });

  const existingStatusByKey = new Map(
    existingDeliveries.map((delivery) => [delivery.signalKey, delivery.status]),
  );

  const freshSignals = reservableSignals.filter((signal) => !existingStatusByKey.has(signal.id));
  const retryableSignals = reservableSignals.filter(
    (signal) => existingStatusByKey.get(signal.id) === 'FAILED',
  );

  if (freshSignals.length) {
    await prisma.notificationDelivery.createMany({
      data: freshSignals.map((signal) => ({
        userId,
        trackedItemId: signal.trackedItemId,
        signalKey: signal.id,
        signalLabel: signal.label,
        signalTitle: signal.title,
        signalValue: signal.value,
        reservationToken,
        status: 'RESERVED',
      })),
      skipDuplicates: true,
    });
  }

  if (retryableSignals.length) {
    await prisma.$transaction(
      retryableSignals.map((signal) =>
        prisma.notificationDelivery.updateMany({
          where: {
            userId,
            signalKey: signal.id,
            status: 'FAILED',
          },
          data: {
            trackedItemId: signal.trackedItemId,
            signalLabel: signal.label,
            signalTitle: signal.title,
            signalValue: signal.value,
            reservationToken,
            status: 'RESERVED',
            sentAt: null,
            failureReason: null,
          },
        }),
      ),
    );
  }

  const reservedDeliveries = await prisma.notificationDelivery.findMany({
    where: {
      userId,
      reservationToken,
      status: 'RESERVED',
    },
    select: {
      signalKey: true,
    },
  });

  const reservedKeys = new Set(reservedDeliveries.map((delivery) => delivery.signalKey));
  return reservableSignals.filter((signal) => reservedKeys.has(signal.id));
}

async function sendSignalEmail(recipient: NotificationRecipient, signals: Signal[]) {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [recipient.email],
      subject: buildEmailSubject(signals),
      html: buildEmailHtml(recipient, signals),
      text: buildEmailText(recipient, signals),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email send failed with ${response.status}: ${body}`);
  }
}

function buildEmailSubject(signals: Signal[]) {
  if (signals.length === 1) {
    return `New ${signals[0].label.toLowerCase()} in PokeTracker`;
  }

  return `${signals.length} new market signals in PokeTracker`;
}

function buildEmailHtml(recipient: NotificationRecipient, signals: Signal[]) {
  const name = recipient.displayName || recipient.email;
  const items = signals
    .slice(0, 8)
    .map((signal) => {
      const link = signal.label === 'BUY SIGNAL' ? signal.ebayUrl : signal.tcgplayerUrl;
      const actionText = signal.label === 'BUY SIGNAL' ? 'Open eBay listing' : 'Review market spread';
      return `
        <tr>
          <td style="padding:16px 0;border-top:1px solid #e5ecf6;">
            <div style="font-size:12px;letter-spacing:0.08em;color:#6a7a90;text-transform:uppercase;">${escapeHtml(signal.label)}</div>
            <div style="font-size:18px;font-weight:700;color:#23354d;margin-top:4px;">${escapeHtml(signal.title)}</div>
            <div style="font-size:14px;line-height:1.5;color:#4f637b;margin-top:6px;">${escapeHtml(signal.reason)}</div>
            <div style="font-size:18px;font-weight:700;color:#1d4ed8;margin-top:8px;">${escapeHtml(signal.value)}</div>
            <div style="margin-top:12px;">
              <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#dce9ff;border:2px solid #314760;color:#23354d;text-decoration:none;font-weight:700;">${actionText}</a>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="background:#f6fbf7;padding:32px;font-family:Verdana, Geneva, sans-serif;color:#23354d;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:2px solid #314760;border-radius:18px;box-shadow:6px 6px 0 #314760;padding:28px;">
        <div style="font-size:12px;letter-spacing:0.1em;color:#6a7a90;text-transform:uppercase;">PokeTracker Alerts</div>
        <h1 style="margin:8px 0 10px;font-size:30px;line-height:1.15;">New signals for your watchlist</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4f637b;">
          Hi ${escapeHtml(name)}. ${signals.length === 1 ? 'A new signal matched' : `${signals.length} new signals matched`} the cards you are actively watching.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6a7a90;">
          Manage notification preferences in <a href="${APP_BASE_URL}/settings" style="color:#1d4ed8;">account settings</a>.
        </p>
      </div>
    </div>
  `;
}

function buildEmailText(recipient: NotificationRecipient, signals: Signal[]) {
  const name = recipient.displayName || recipient.email;
  const intro = `Hi ${name},\n\n${signals.length === 1 ? 'A new signal matched' : `${signals.length} new signals matched`} the cards on your PokeTracker watchlist.\n`;
  const body = signals
    .slice(0, 8)
    .map((signal) => {
      const link = signal.label === 'BUY SIGNAL' ? signal.ebayUrl : signal.tcgplayerUrl;
      return `${signal.label}: ${signal.title}\n${signal.reason}\nValue: ${signal.value}\n${link}`;
    })
    .join('\n\n');

  return `${intro}\n${body}\n\nManage notification preferences: ${APP_BASE_URL}/settings`;
}

async function markReservationSent(userId: string, reservationToken: string) {
  await prisma.notificationDelivery.updateMany({
    where: {
      userId,
      reservationToken,
      status: 'RESERVED',
    },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  });
}

async function markReservationFailed(userId: string, reservationToken: string, failureReason: string) {
  await prisma.notificationDelivery.updateMany({
    where: {
      userId,
      reservationToken,
      status: 'RESERVED',
    },
    data: {
      status: 'FAILED',
      failureReason,
    },
  });
}

function getTrackedItemIdForSignal(signal: Signal, snapshots: DashboardSnapshot[]) {
  const signalBaseId = signal.id.replace(/-(buy|arb)$/, '');
  const snapshot = snapshots.find((candidate) => candidate.id === signalBaseId);
  return snapshot?.trackedItemId ?? null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
