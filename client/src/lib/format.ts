export function money(minor: number, currency = "USD") {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
    } catch {
        return `${currency} ${(minor / 100).toFixed(2)}`;
    }
}
export function dateTime(value?: string) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }

export function fileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const amount = bytes / 1024 ** index;
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: index === 0 ? 0 : 1 }).format(amount)} ${units[index]}`;
}
