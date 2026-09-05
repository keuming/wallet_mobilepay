'use client';

import { Suspense } from 'react';
import PotActionPanel from '../../components/PotActionPanel';

export default function EpargnePage() {
  return (
    <Suspense fallback={null}>
      <PotActionPanel
        kind="epargne"
        title="🥇 Épargne Gold"
        apiBase="/savings/types"
        typesHref="/types-epargne"
      />
    </Suspense>
  );
}
