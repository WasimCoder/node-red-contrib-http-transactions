export interface HTTPTransactionConfig {
  http_request: {
    http_version: '1.1' | '2';
    method: string[];
    follow_redirects: boolean;
    custom_headers: { [key: string]: string };
    user_agent: string;
    agent_options: {
      keep_alive: boolean;
      reject_unauthorized: boolean;
    };
  };
  http_response: {
    desired_status_code: string;
    verify_content: string;
    limit_download_size_kb: number;
  };
  server_timing: {
    timeout_sec: number;
    target_response_time_ms: number;
  };
  exclude: {
    domains: string[];
    object_urls: string[];
  };
}

export interface HARRequestEntry {
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: { name: string; value: string }[];
    postData?: { text: string };
  };
  timings?: {
    blocked?: number;
    dns?: number;
    connect?: number;
    send?: number;
    wait?: number;
    receive?: number;
    ssl?: number;
  };
}

export interface HARReplayResult {
  domain: string;
  url: string;
  method: string;
  request: {
    headers: { [key: string]: string };
    params: { [key: string]: string };
    body?: string;
  };
  timings: {
    blocked_time: number | null;
    dns_time: number | null;
    connect_time: number | null;
    send_time: number | null;
    wait_time: number | null;
    receive_time: number | null;
    ssl_time: number | null;
    total_time: number | null;
  };
  status: number | null;
  response: {
    headers: any;
    body?: any;
  };
  error: string | null;
  metrics: {
    transaction_time: number | null;
    error: string | null;
    status: number | null;
    dom_load_time: null;
    page_load_time: null;
    availability: number;
    slow: boolean;
    status_verified: boolean;
    content_verified: boolean;
    download_limit_exceeded: boolean;
  };
}

export interface HARAnalyserReport {
  summary: {
    total_requests: number;
    successful: number;
    failed: number;
    timeout: number;
    error_count: number;
    average_response_time: number | null;
    slowest_request: string | null;
    errors: Array<any>;
  };
  overall: {
    overall_completion_time: number | null;
    overall_transaction_time: number | null;
    overall_availability: number | null;
  };
  details: HARReplayResult[];
  config_used: HTTPTransactionConfig;
}