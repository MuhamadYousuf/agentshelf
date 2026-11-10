import { CaptureFlow } from "@/components/merchant/capture-flow";

export default function MerchantCapturePage() {
  return (
    <>
      <div className="capture-page-heading">
        <h1 className="merchant-page-title">Capture a product</h1>
        <p className="merchant-page-subtitle">A few photos become a draft you can shape before it reaches your shop.</p>
      </div>
      <CaptureFlow />
    </>
  );
}
