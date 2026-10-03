import type { sizeType } from "../../lib/types";


export function Spinner({ size }: { size: sizeType }) {
    function getSize(size: sizeType) {
        switch (size) {
            case 'sm':
                return 'w-4 h-4';
            case 'md':
                return 'w-8 h-8';
            case 'lg':
                return 'w-10 h-10';
            case 'xl':
                return 'w-20 h-20';
            case '2xl':
                return 'w-25 h-25';
            case '4xl':
                return 'w-32 h-32';
            default:
                return 'w-10 h-10';
        }
    }

    return (
        <div className={`${getSize(size)} spinner`} role="status" aria-label="Loading" />
    )

}
