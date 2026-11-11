import { Skeleton } from "@/components/ui/skeleton";

export function MerchantOverviewSkeleton() {
  return (
    <div aria-busy="true" className="merchant-overview">
      <div className="listing-review-head dashboard-heading">
        <div><Skeleton className="h-10 w-48" /><Skeleton className="mt-3 h-4 w-80 max-w-full" /></div>
        <Skeleton className="h-10 w-48" />
      </div>
      <section className="merchant-kpi-grid" aria-label="Loading sales summary">
        {Array.from({ length: 5 }, (_, index) => <Skeleton className="h-32 rounded-xl" key={index} />)}
      </section>
      <section className="merchant-chart-grid" aria-label="Loading sales charts">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </section>
      <Skeleton className="mt-5 h-64 w-full rounded-xl" />
    </div>
  );
}

export function MerchantOrdersSkeleton() {
  return (
    <div aria-busy="true" className="merchant-orders-page">
      <div className="listing-review-head orders-page-heading">
        <div><Skeleton className="h-10 w-40" /><Skeleton className="mt-3 h-4 w-72 max-w-full" /></div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="orders-toolbar"><Skeleton className="h-10 w-96 max-w-full" /><Skeleton className="h-9 w-40" /></div>
      <div className="orders-grid-shell grid-skeleton-shell">
        <Skeleton className="h-11 w-full rounded-none" />
        {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-[72px] w-full rounded-none" key={index} />)}
      </div>
    </div>
  );
}

export function MerchantNegotiationsSkeleton() {
  return (
    <div aria-busy="true">
      <div className="negotiations-page-head">
        <div><Skeleton className="h-10 w-52" /><Skeleton className="mt-3 h-4 w-[38rem] max-w-full" /></div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="products-table-shell negotiations-table-shell">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-14 w-full rounded-none" key={index} />)}
      </div>
    </div>
  );
}
