import CheckoutPage from '../../../components/CheckoutPage';

export default function PaymentLinkPayPage({ params }: { params: { slug: string } }) {
  return (
    <CheckoutPage
      resolveEndpoint={`/payment-links/${params.slug}`}
      payExternalEndpoint={`/payment-links/${params.slug}/pay-external`}
      walletAppUrl="https://wallet.mobilepay-ci.com"
      walletAppQueryKey="link"
      identifier={params.slug}
    />
  );
}
