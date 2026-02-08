interface CopilotNotificationProps {
  message: string;
  type?: 'info' | 'success' | 'warning';
}

export function CopilotNotification({ message, type = 'info' }: CopilotNotificationProps) {
  if (!message) return null;
  const color = type === 'success' ? '#00ff88' : type === 'warning' ? '#ffaa00' : '#00aaff';
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        background: 'rgba(0,0,0,0.85)',
        border: `1px solid ${color}`,
        borderRadius: 8,
        color,
        fontSize: 14,
        zIndex: 15,
        maxWidth: '90%',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}
