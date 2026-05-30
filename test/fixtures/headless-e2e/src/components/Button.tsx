export function Button({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      backgroundColor: '#0066ff',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: '4px',
      border: 'none',
    }}>{label}</button>
  );
}
