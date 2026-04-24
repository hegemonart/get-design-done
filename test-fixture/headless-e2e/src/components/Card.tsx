export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px', background: '#ffffff', borderRadius: '8px' }}>
      <h2 style={{ marginBottom: '16px' }}>{title}</h2>
      {children}
    </div>
  );
}
