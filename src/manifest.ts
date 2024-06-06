export interface ManifestContentScript {
  matches?: string[];
  js?: string[];
  run_at?: "document_end" | "document_start" | "document_idle";
  all_frames?: boolean;
}

export interface Manifest {
  manifest_version: number;
  version?: string;
  description?: string;
  author?: string;
  version_name?: string;
  name?: string;
  permissions?: string[];
  chrome_url_overrides?: {
    bookmarks?: string;
    history?: string;
    newtap?: string;
  };
  commands?: Record<
    string,
    {
      suggested_key?: Record<string, string>;
      description?: string;
    }
  >;
  action?: {
    default_popup?: string;
  };
  content_scripts?: ManifestContentScript[];
  background?: {
    service_worker: string;
    type: "module";
  };
  content_security_policy?: {
    extension_pages?: string;
  };
  icons?: Record<string, string>;
  host_permissions?: string[];
  web_accessible_resources?: WebAccessibleResource[];
  [key: string]: unknown;
}

export interface WebAccessibleResource {
  resources: string[];
  matches?: string[];
  use_dynamic_url?: boolean;
  extension_ids?: string[];
}

export function defineManifest(manifest: Partial<Manifest>): Manifest {
  return {
    manifest_version: 3,
    ...manifest,
  };
}
