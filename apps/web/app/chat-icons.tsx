export function ChatIcon({
  name,
}: {
  name:
    | 'menu'
    | 'close'
    | 'previous'
    | 'next'
    | 'retry'
    | 'plus'
    | 'settings'
    | 'pin'
    | 'trash';
}) {
  const paths = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M6 18 18 6',
    previous: 'm14 5-7 7 7 7',
    next: 'm10 5 7 7-7 7',
    retry: 'M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 7l-3-3',
    plus: 'M12 4v16M4 12h16',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    pin: 'M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6',
    trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
