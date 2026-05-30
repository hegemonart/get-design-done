import { Button } from './components/Button';
import { Card } from './components/Card';

export function App() {
  return (
    <div style={{ padding: '12px', background: '#f5f5f5' }}>
      <h1 style={{ color: '#111', fontSize: '28px' }}>Welcome</h1>
      <Card title="Plans">
        <Button label="Start" onClick={() => {}} />
        <Button label="Continue" onClick={() => {}} />
      </Card>
    </div>
  );
}
