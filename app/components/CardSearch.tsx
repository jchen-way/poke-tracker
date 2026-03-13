'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type CardSearchItem = {
  id: string;
  cardId: string | null;
  name: string;
  setName: string;
  number: string | null;
};

export default function CardSearch({
  items,
  range,
  initialQuery,
  activeCardId,
}: {
  items: CardSearchItem[];
  range: string;
  initialQuery: string;
  activeCardId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const base = normalized
      ? items.filter((item) =>
          [item.name, item.setName, item.cardId ?? '', item.number ?? '']
            .join(' ')
            .toLowerCase()
            .includes(normalized),
        )
      : items;

    return base.slice(0, 24);
  }, [items, query]);

  const onSelect = (item: CardSearchItem) => {
    const params = new URLSearchParams();
    params.set('range', range);
    params.set('cardId', item.cardId ?? '');
    params.set('q', item.name);
    setQuery(item.name);
    setOpen(false);
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div className="card-search-form">
      <label htmlFor="card-search" className="card-selector-label text-muted">
        Find tracked card
      </label>
      <div className="search-combobox">
        <div className="search-input-wrap">
          <Search size={18} />
          <input
            id="card-search"
            name="q"
            type="search"
            placeholder="Search by name, set, or card id"
            autoComplete="off"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
          />
        </div>
        {open ? (
          <div className="search-dropdown-panel">
            <div className="search-dropdown-list">
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(item)}
                    className={`search-option ${item.cardId === activeCardId ? 'active' : ''}`}
                  >
                    <span>{item.name}</span>
                    <span className="text-muted">
                      {item.setName}
                      {item.number ? ` #${item.number}` : ''}
                    </span>
                  </button>
                ))
              ) : (
                <div className="search-empty text-muted">No tracked cards matched that search.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
