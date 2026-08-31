import CheckoutPage from '../../../components/CheckoutPage';

export default function ParticulierQrPayPage({ params }: { params: { code: string } }) {
  return (
    <CheckoutPage
      resolveEndpoint={`/qr/${params.code}`}
      payExternalEndpoint={`/qr/${params.code}/pay-external`}
      walletAppUrl="https://wallet.mobilepay-ci.com"
      walletAppQueryKey="u"
      walletAppPath="envoyer"
      mobilePaySubtitle="Ouvre ton app MobilePay et envoie à ce numéro"
      identifier={params.code}
    />
  );
}
