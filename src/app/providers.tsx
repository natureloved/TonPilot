"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import React, { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [manifestUrl, setManifestUrl] = useState("");

  useEffect(() => {
    // Dynamically retrieve origin to prevent manifest CORS issues on Vercel preview URLs
    if (typeof window !== "undefined") {
      setManifestUrl(`${window.location.origin}/tonconnect-manifest.json`);
    }
  }, []);

  if (!manifestUrl) {
    return <>{children}</>;
  }

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
