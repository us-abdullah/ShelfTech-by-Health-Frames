interface VoiceAnswerPopupProps {
  question: string;
  answer: string;
  productName: string | null;
  onClose: () => void;
}

export function VoiceAnswerPopup({ question, answer, productName, onClose }: VoiceAnswerPopupProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        padding: 24,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(18, 20, 24, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: '#00ff88', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {productName ? `About ${productName}` : 'Voice answer'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {question && (
          <p style={{ fontSize: 13, color: '#888', marginBottom: 12, fontStyle: 'italic' }}>
            “{question}”
          </p>
        )}
        <p style={{ fontSize: 15, color: '#e8e8e8', lineHeight: 1.55, margin: 0 }}>
          {answer}
        </p>
      </div>
    </div>
  );
}
