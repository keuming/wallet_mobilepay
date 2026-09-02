export default function Home() {
  return (
    <div className="mp-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 24px' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>💳</div>
      <h1 style={{ fontSize: 22, marginBottom: 10 }}>MobilePay CI</h1>
      <p style={{ color: 'var(--mp-muted)', fontSize: 14.5, maxWidth: 320, lineHeight: 1.5 }}>
        Cette page sert à effectuer un paiement à partir d'un QR code ou d'un lien de paiement
        MobilePay. Scanne un QR ou ouvre le lien qu'on t'a partagé pour continuer.
      </p>
    </div>
  );
}
