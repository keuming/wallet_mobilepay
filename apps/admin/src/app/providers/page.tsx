'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../lib/apiClient';
import AdminShell from '../../components/AdminShell';

interface ProviderRow {
  name: string;
  label: string;
  usage: string;
  configured: boolean;
  mode: string;
}

interface CommissionLine {
  volume: number;
  hub2Fee?: number;
  mobilePayMarkup: number;
  total: number;
}

interface ProviderKpis {
  hub2: {
    payoutBalance: number;
    payoutReserved: number;
    collectionAvailable: number | null;
    currency: string;
    fetchedAt: string | null;
    configured: boolean;
  };
  reloadly: {
    balance: number;
    currencyCode: string;
    updatedAt: string | null;
    configured: boolean;
  };
  reloadlyConsumption: { airtime: Record<string, number>; data: Record<string, number> };
  commissions: {
    hub2PayIn: CommissionLine;
    hub2PayOut: CommissionLine;
    reloadlyTopup: CommissionLine;
    reloadlyData: CommissionLine;
  };
}

function fcfa(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} FCFA`;
}

function CommissionCard({
  icon,
  title,
  subtitle,
  data,
  showHub2Fee,
}: {
  icon: string;
  title: string;
  subtitle: string;
  data: CommissionLine;
  showHub2Fee: boolean;
}) {
  return (
    <div className="adm-commission-card">
      <div className="adm-commission-icon">{icon}</div>
      <div className="adm-commission-body">
        <div className="adm-commission-title">{title}</div>
        <div className="adm-commission-subtitle">{subtitle}</div>
        <div className="adm-commission-total">{fcfa(data.total)}</div>
        <div className="adm-commission-breakdown">
          <span>Volume : {fcfa(data.volume)}</span>
          {showHub2Fee && <span>Frais HUB2 : {fcfa(data.hub2Fee ?? 0)}</span>}
          <span>Marge MobilePay (1%) : {fcfa(data.mobilePayMarkup)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [kpis, setKpis] = useState<ProviderKpis | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
      return;
    }
    apiFetch<ProviderRow[]>('/admin/providers').then(setProviders);
    apiFetch<ProviderKpis>('/admin/kpis/providers').then(setKpis);
  }, [admin, loading, router]);

  if (loading || !admin) return null;

  return (
    <AdminShell title="Providers de paiement">
      <p style={{ color: 'var(--adm-muted)', fontSize: 13, marginBottom: 20 }}>
        Statut des intégrations, soldes réels et commissions calculées depuis la grille tarifaire
        HUB2 (frais réels par opérateur) et la marge MobilePay de 1% appliquée à tout type de
        transaction, tout opérateur confondu.
      </p>

      {/* Soldes réels */}
      <div className="adm-section-title">💰 Soldes</div>
      <div className="adm-provider-grid">
        <div className="adm-provider-card">
          <div className="adm-provider-card-header">
            <span className="adm-provider-name">HUB2</span>
            <span className={`adm-provider-badge ${kpis?.hub2.configured ? 'live' : 'off'}`}>
              {kpis?.hub2.configured ? 'Connecté' : 'Solde de départ'}
            </span>
          </div>
          {kpis && (
            <>
              <div className="adm-provider-row">
                <span>Solde transfert (pay-out)</span>
                <span>{fcfa(kpis.hub2.payoutBalance)}</span>
              </div>
              {kpis.hub2.configured && (
                <div className="adm-provider-row">
                  <span>Solde réservé</span>
                  <span>{fcfa(kpis.hub2.payoutReserved)}</span>
                </div>
              )}
              <div className="adm-provider-row">
                <span>Solde collecte</span>
                <span>{kpis.hub2.collectionAvailable !== null ? fcfa(kpis.hub2.collectionAvailable) : '—'}</span>
              </div>
              {!kpis.hub2.configured && (
                <p className="adm-provider-empty" style={{ marginTop: 8 }}>
                  Solde de départ pré-financé affiché. Ajoutez HUB2_API_KEY, HUB2_MERCHANT_ID et
                  HUB2_ENVIRONMENT dans le .env de l'API pour y additionner le vrai solde HUB2.
                </p>
              )}
            </>
          )}
        </div>

        <div className="adm-provider-card">
          <div className="adm-provider-card-header">
            <span className="adm-provider-name">Reloadly</span>
            <span className={`adm-provider-badge ${kpis?.reloadly.configured ? 'live' : 'off'}`}>
              {kpis?.reloadly.configured ? 'Connecté' : 'Solde de départ'}
            </span>
          </div>
          {kpis && (
            <>
              <div className="adm-provider-row">
                <span>Solde disponible</span>
                <span>{fcfa(kpis.reloadly.balance)}</span>
              </div>
              {!kpis.reloadly.configured && (
                <p className="adm-provider-empty" style={{ marginTop: 8 }}>
                  Solde de départ pré-financé affiché. Ajoutez RELOADLY_CLIENT_ID et
                  RELOADLY_CLIENT_SECRET dans le .env de l'API pour y additionner le vrai solde.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Commissions */}
      <div className="adm-section-title">💸 Commissions</div>
      {!kpis ? (
        <p style={{ color: 'var(--adm-muted)' }}>Chargement...</p>
      ) : (
        <div className="adm-commission-grid">
          <CommissionCard
            icon="📥"
            title="HUB2 Pay-in"
            subtitle="Recharges wallet (collecte)"
            data={kpis.commissions.hub2PayIn}
            showHub2Fee
          />
          <CommissionCard
            icon="📤"
            title="HUB2 Pay-out"
            subtitle="Envois externes (décaissement)"
            data={kpis.commissions.hub2PayOut}
            showHub2Fee
          />
          <CommissionCard
            icon="📞"
            title="Reloadly Top-up"
            subtitle="Crédit d'appel"
            data={kpis.commissions.reloadlyTopup}
            showHub2Fee={false}
          />
          <CommissionCard
            icon="📶"
            title="Reloadly Data"
            subtitle="Forfaits internet"
            data={kpis.commissions.reloadlyData}
            showHub2Fee={false}
          />
        </div>
      )}

      {/* Consommation Reloadly par opérateur */}
      <div className="adm-section-title">📊 Consommation Reloadly par opérateur</div>
      <div className="adm-consumption-grid">
        <div className="adm-consumption-card">
          <div className="adm-consumption-title">Crédit d'appel</div>
          {!kpis || Object.keys(kpis.reloadlyConsumption.airtime).length === 0 ? (
            <p className="adm-provider-empty">Aucune consommation enregistrée pour le moment.</p>
          ) : (
            Object.entries(kpis.reloadlyConsumption.airtime).map(([operator, amount]) => (
              <div className="adm-operator-row" key={operator}>
                <span>{operator}</span>
                <span className="adm-operator-amount">{fcfa(amount)}</span>
              </div>
            ))
          )}
        </div>
        <div className="adm-consumption-card">
          <div className="adm-consumption-title">Data</div>
          {!kpis || Object.keys(kpis.reloadlyConsumption.data).length === 0 ? (
            <p className="adm-provider-empty">Aucune consommation enregistrée pour le moment.</p>
          ) : (
            Object.entries(kpis.reloadlyConsumption.data).map(([operator, amount]) => (
              <div className="adm-operator-row" key={operator}>
                <span>{operator}</span>
                <span className="adm-operator-amount">{fcfa(amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Statut des intégrations */}
      <div className="adm-section-title">🔌 Statut des intégrations</div>
      <div className="adm-panel">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Usage</th>
              <th>Statut</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ color: 'var(--adm-muted)', textAlign: 'center', padding: 24 }}>
                  Chargement...
                </td>
              </tr>
            ) : (
              providers.map((p) => (
                <tr key={p.name}>
                  <td style={{ fontWeight: 600 }}>{p.label}</td>
                  <td style={{ color: 'var(--adm-muted)' }}>{p.usage}</td>
                  <td>
                    <span className={`adm-badge ${p.configured ? 'green' : 'gray'}`}>
                      {p.configured ? 'Configuré' : 'Non configuré'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--adm-muted)', fontSize: 12 }}>{p.mode}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
