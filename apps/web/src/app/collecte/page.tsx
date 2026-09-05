'use client';

import { Suspense } from 'react';
import PotActionPanel from '../../components/PotActionPanel';

export default function CollectePage() {
  return (
    <Suspense fallback={null}>
      <PotActionPanel
        kind="collecte"
        title="🗃️ Collecte"
        apiBase="/collecte/types"
        typesHref="/types-collecte"
      />
    </Suspense>
  );
}
