import CheckoutPage from '../../../components/CheckoutPage';

export default function QrPayPage({ params }: { params: { code: string } }) {
  return (
    <CheckoutPage
      resolveEndpoint={`/qr/${params.code}`}
      payExternalEndpoint={`/qr/${params.code}/pay-external`}
      walletAppUrl="https://wallet.mobilepay-ci.com"
      walletAppQueryKey="qr"
      identifier={params.code}
    />
  );
}
