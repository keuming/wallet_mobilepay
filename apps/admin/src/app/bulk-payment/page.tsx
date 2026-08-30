'use client';

import EnterpriseServicePage from '../../components/EnterpriseServicePage';

export default function BulkPaymentPage() {
  return (
    <EnterpriseServicePage
      serviceType="BULK_PAYMENT"
      title="Bulk Payment"
      icon="📤"
      description="Marchands utilisant MobilePay pour les versements de masse (salaires, indemnités, remboursements...)."
    />
  );
}
