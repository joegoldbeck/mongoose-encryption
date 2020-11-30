declare function _exports(schema: any, options: {
    secret?: string;
    encryptionKey?: string;
    signingKey?: string;
    encryptedFields?: string[];
    excludeFromEncryption?: string[];
    additionalAuthenticatedFields?: string[];
    requireAuthenticationCode?: boolean;
    decryptPostSave?: boolean;
    collectionId?: string;
}): undefined;
declare namespace _exports {
    const encryptedChildren: (schema: any) => void;
    const migrations: (schema: any, options: any) => void;
}
export = _exports;
