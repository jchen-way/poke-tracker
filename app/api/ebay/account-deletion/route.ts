import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function buildChallengeResponse(challengeCode: string) {
  const verificationToken = getRequiredEnv('EBAY_VERIFICATION_TOKEN');
  const endpoint = getRequiredEnv('EBAY_ACCOUNT_DELETION_ENDPOINT');

  return createHash('sha256')
    .update(`${challengeCode}${verificationToken}${endpoint}`)
    .digest('hex');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const challengeCode = searchParams.get('challenge_code');

    if (!challengeCode) {
      return NextResponse.json(
        { success: false, error: 'Missing challenge_code' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      challengeResponse: buildChallengeResponse(challengeCode),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown eBay verification error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await request.json().catch(() => null);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown eBay notification error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
