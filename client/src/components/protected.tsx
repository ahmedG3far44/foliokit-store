import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Spinner } from "./ui/spinner";
import { useAppAuth } from "../context/auth-store";
import { ErrorMessage } from "./ui/error-message";


export default function Protected({ children, adminOnly = false, customerOnly = false }: { children: ReactNode; adminOnly?: boolean; customerOnly?: boolean }) {

    const { user, isReady, isAuthenticated, error } = useAppAuth();


    if (!isReady) return <div className="page-loader"><Spinner size="md" /></div>

    if (!isAuthenticated) return <Navigate to={"/sign-in"} replace />
    if (error) return <main className="centered-state"><ErrorMessage message={error} /></main>
    if (adminOnly && user?.role !== "admin") return <Navigate to="/" replace />;
    if (customerOnly && user?.role === "admin") return <Navigate to="/" replace />;

    return (
        <>
            {children}
        </>
    )

}
