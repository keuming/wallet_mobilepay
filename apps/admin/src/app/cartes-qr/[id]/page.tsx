'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../../lib/apiClient';

interface QrImage {
  code: string;
  url: string;
  imageDataUrl: string;
  status: string;
}

export default function QrBatchImagesPage() {
  const params = useParams();
  const [label, setLabel] = useState('');
  const [images, setImages] = useState<QrImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ label: string; images: QrImage[] }>(`/admin/qr-batches/${params.id}/images`)
      .then((r) => {
        setLabel(r.label);
        setImages(r.images);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <p style={{ padding: 24 }}>Chargement...</p>;
  return (
    <div style={{ padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>{label}</h1>
          <p style={{ color: '#64748b', fontSize: 13 }}>{images.length} carte(s) QR</p>
        </div>
        <button onClick={() => window.print()} style={{ background: '#0f2d52', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>
          Imprimer
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
        {images.map((img) => (
          <div
            key={img.code}
            style={{
              border: '2px solid #0f2d52',
              borderRadius: 16,
              padding: 16,
              textAlign: 'center',
              background: '#fff',
              breakInside: 'avoid',
            }}
          >
            <img src={img.imageDataUrl} alt={img.code} style={{ width: '100%', height: 'auto' }} />
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: '#0f2d52', letterSpacing: 1 }}>
              ORZAYAH
            </div>
            <div style={{ fontSize: 10, color: '#00D27A', fontWeight: 700, marginTop: 2 }}>
              Scanne pour payer
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>
              {img.code}
            </div>
            <a
              href={img.imageDataUrl}
              download={`orzayah-${img.code}.png`}
              className='no-print'
              style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: '#0f2d52', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Telecharger
            </a>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
