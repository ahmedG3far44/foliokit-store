import { lazy, Suspense, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { CategoryType } from "../lib/types";
import { api } from "../lib/api";
import { useAsync } from "../hooks/use-async";
import { Spinner } from "../components/ui/spinner";
import { ErrorState } from "./error/error";
import ThemesPage from "./themes";
const ThemeDetail = lazy(() => import("./theme-detail"));

export default function ThemeOrCategory() {
  const { slug } = useParams();
  return <ResolveThemeRoute key={slug} slug={slug!} />;
}
function ResolveThemeRoute({ slug }: { slug: string }) {
  const { data, error, run } = useAsync<CategoryType[]>();
  const load = () => run(api.get<CategoryType[]>("/categories")).catch(() => undefined);
  useEffect(() => { void run(api.get<CategoryType[]>("/categories")).catch(() => undefined); }, [run]);
  if (error) return <ErrorState title="We couldn’t load this page" message={error} onRetry={() => void load()} />;
  if (!data) return <div className="page-loader"><Spinner size="md" /></div>;
  const category = data.find((item) => item.slug === slug);
  return category ? <ThemesPage key={category.id} category={category} /> : <Suspense fallback={<div className="page-loader"><Spinner size="md" /></div>}><ThemeDetail /></Suspense>;
}
