import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { CategoryType } from "../lib/types";
import { api } from "../lib/api";
import { useAsync } from "../hooks/use-async";
import { FallbackImage } from "./fallback-image";
import { ErrorMessage } from "./ui/error-message";
import { Skeleton } from "./ui/skeleton";

export function CategoryCards() {
  const { data, error, isLoading, run } = useAsync<CategoryType[]>();
  const load = () =>
    run(
      api.get<CategoryType[]>("/categories", {
        signal: AbortSignal.timeout(15_000),
      }),
    ).catch(() => undefined);
  useEffect(() => {
    void run(
      api.get<CategoryType[]>("/categories", {
        signal: AbortSignal.timeout(15_000),
      }),
    ).catch(() => undefined);
  }, [run]);
  if (data?.length === 0) return null;

  return (
    <section
      className="featured-themes landing-reveal"
      data-reveal
      aria-labelledby="categories-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Browse by category</span>
          <h2 id="categories-title">Find a theme for your kind of work.</h2>
          <p>Explore designs for creators, agencies, developers, and stores.</p>
        </div>
      </div>
      {error && (
        <>
          <ErrorMessage message={error} />
          <button onClick={() => void load()}>Retry categories</button>
        </>
      )}

      <div className="theme-grid">
        {isLoading && !data
          ? [1, 2, 3].map((id) => (
              <Skeleton key={id} className="aspect-[6/5] w-full rounded-2xl" />
            ))
          : data?.map((category) => (
              <Link
                className="group block min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                key={category.id}
                to={`/themes/${category.slug}`}
              >
                <div className="relative aspect-[6/5] w-full overflow-hidden rounded-2xl">
                  <FallbackImage
                    src={category.image?.url ?? category.imageUrl}
                    alt=""
                    loading="eager"
                    loadTimeoutMs={12_000}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:transform-none"
                  />
                </div>
                <h3 className="text-lg my-4 text-center">{category.name}</h3>
              </Link>
            ))}
      </div>
    </section>
  );
}
