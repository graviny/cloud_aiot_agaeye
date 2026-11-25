import type { ComponentType } from 'react';
export interface PageRegistry {
    Welcome?: ComponentType;
    Auth?: ComponentType;
    ChildSetup?: ComponentType;
    AlertSetup?: ComponentType;
    Dashboard?: ComponentType<{
        onAlert: () => void;
    }>;
    Summary?: ComponentType;
    ChildManagement?: ComponentType;
    Monitor?: ComponentType<{
        onAlert: () => void;
    }>;
    AlertModal?: ComponentType<{
        onClose: () => void;
    }>;
    Settings?: ComponentType;
}
