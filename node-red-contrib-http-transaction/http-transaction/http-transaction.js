/**
 * Node-RED Custom Node: har-analyser
 * Processes HTTP Archive (HAR) files to analyze and replay web transactions.
 */

const fs = require('fs');
const axios = require('axios');
const { performance } = require('perf_hooks');
const urlLib = require('url');
const path = require('path');
const https = require('https');
const http = require('http');

// Default configuration
const DEFAULT_CONFIG = {
  http_request: {
    http_version: '2',
    method: [],
    follow_redirects: true,
    custom_headers: {},
    user_agent: '',
    agent_options: {
      keep_alive: true,
      reject_unauthorized: false,
    },
  },
  http_response: {
    desired_status_code: '',
    verify_content: '',
    limit_download_size_kb: 1024,
  },
  server_timing: {
    timeout_sec: 30,
    target_response_time_ms: 2000,
  },
  exclude: {
    domains: [],
    object_urls: [],
  },
};

// --- HELPERS ---

function deep_merge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target) {
      Object.assign(source[key], deep_merge(target[key], source[key]));
    }
  }
  return { ...target, ...source };
}

function ms(val) {
  return typeof val === 'number' && !isNaN(val) ? Math.round(val) : null;
}

function parse_timings(timings) {
  return {
    blocked_time: ms(timings.blocked),
    dns_time: ms(timings.dns),
    connect_time: ms(timings.connect),
    send_time: ms(timings.send),
    wait_time: ms(timings.wait),
    receive_time: ms(timings.receive),
    ssl_time: ms(timings.ssl),
    total_time: ms(
      ['blocked', 'dns', 'connect', 'send', 'wait', 'receive', 'ssl']
        .map(k => timings[k])
        .filter(Number.isFinite)
        .reduce((acc, cur) => acc + cur, 0)
    ),
  };
}

function extract_params(url) {
  try {
    const { searchParams } = new urlLib.URL(url);
    const params = {};
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }
    return params;
  } catch (e) {
    return {};
  }
}

function is_method_allowed(method, allowed_methods) {
  return allowed_methods.length === 0 || allowed_methods.includes(method.toUpperCase());
}

function is_url_excluded(url, config) {
  if (config.exclude.domains && config.exclude.domains.some(domain => url.includes(domain))) return true;
  if (config.exclude.object_urls && config.exclude.object_urls.some(obj_url => url.includes(obj_url))) return true;
  return false;
}

function is_valid_status(status, desired_status_code) {
  if (!desired_status_code) return true;
  const code_groups = desired_status_code.split(',').map(s => s.trim());
  return code_groups.some(group => {
    if (/^\dxx$/.test(group)) {
      const major = group[0];
      return status && String(status).startsWith(major);
    }
    return String(status) === group;
  });
}

function verify_content(body, verify_content) {
  if (!verify_content) return true;
  const m = verify_content.match(/^\/(.+)\/([gimsuy]*)$/);
  if (m) {
    const regex = new RegExp(m[1], m[2]);
    return regex.test(body);
  }
  return body.includes(verify_content);
}

async function replay_entry(entry, config) {
  const { method, url, httpVersion, headers, postData } = entry.request;
  const entry_timings = entry.timings || {};
  const params = extract_params(url);

  // Merge headers: HAR headers + config custom headers, override User-Agent if set
  const headers_obj = { 'Content-Type': 'application/json, text/plain, */*' };
  (headers || []).forEach(h => {
    headers_obj[h.name] = h.value;
  });
  Object.assign(headers_obj, config.http_request.custom_headers || {});
  if (config.http_request.user_agent) headers_obj['User-Agent'] = config.http_request.user_agent;

  // Prepare data/body
  let data = undefined;
  if (postData && postData.text) data = postData.text;

  let result = {
    domain: (() => { try { return (new URL(url)).hostname; } catch { return ''; } })(),
    url,
    method,
    request: {
      headers: headers_obj,
      params,
      body: data,
    },
    timings: parse_timings(entry_timings),
    status: null,
    response: {},
    error: null,
    metrics: {},
  };

  // Start transaction timer
  const start = performance.now();
  let response, end, response_body = '';
  let exceeded_download_limit = false;
  try {
    // Allow agent options to be configured
    const http_agent = new http.Agent(config.http_request.agent_options || {});
    const https_agent = new https.Agent(config.http_request.agent_options || {});

    response = await axios({
      headers: headers_obj,
      url,
      method,
      params,
      data,
      httpAgent: http_agent,
      httpsAgent: https_agent,
      timeout: (config.server_timing.timeout_sec || 30) * 1000,
      maxRedirects: config.http_request.follow_redirects ? 5 : 0,
      validateStatus: () => true // Handle all status codes
    });

    // Download limit check
    if (config.http_response.limit_download_size_kb && response.data) {
      let size = 0;
      if (typeof response.data === 'string') size = Buffer.byteLength(response.data, 'utf8');
      else if (Buffer.isBuffer(response.data)) size = response.data.length;
      if (size > config.http_response.limit_download_size_kb * 1024) {
        exceeded_download_limit = true;
        response_body = '';
      } else {
        response_body = response.data;
      }
    } else {
      response_body = response.data;
    }
    end = performance.now();

    result.status = response.status;
    result.response = {
      headers: response.headers,
      body: response.data,
    };
  } catch (err) {
    end = performance.now();
    result.error = err.message;
    result.status = err.response ? err.response.status : null;
    result.response = {
      headers: err.response ? err.response.headers : {},
    };
  }

  // Content verification
  let content_verified = true;
  if (response_body && config.http_response.verify_content) {
    content_verified = verify_content(response_body, config.http_response.verify_content);
  }

  // Desired status code match
  let status_verified = is_valid_status(result.status, config.http_response.desired_status_code);

  // Target response time
  let slow = ms(end - start) > config.server_timing.target_response_time_ms;

  result.metrics = {
    transaction_time: ms(end - start),
    error: result.error,
    status: result.status,
    dom_load_time: null,
    page_load_time: null,
    availability: (status_verified && content_verified && !exceeded_download_limit) ? 1 : 0,
    slow,
    status_verified,
    content_verified,
    download_limit_exceeded: exceeded_download_limit
  };

  return result;
}

// --- PROGRESS ---

function setNodeStatus(node, text, fill = 'blue', shape = 'dot') {
  if (node && node.status) {
    node.status({ fill, shape, text });
  }
}

// --- NODE-RED NODE ---

module.exports = function(RED) {
  function HARAnalyserNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.on('input', async function(msg, send, done) {
      send = send || function() { node.send.apply(node, arguments); };
      setNodeStatus(node, 'initializing...');

      // --- INPUT VALIDATION ---
      let harData = null;
      let harPath = null;
      let userConfig = {};
      let entries = [];

      // Accept har as JSON string, JSON object, or as file path in msg.payload
      if (typeof msg.payload === 'string') {
        // Try to parse as JSON string first
        try {
          harData = JSON.parse(msg.payload);
        } catch (jsonErr) {
          // If not valid JSON, treat as file path
          harPath = msg.payload;
          if (!fs.existsSync(harPath)) {
            setNodeStatus(node, 'HAR file not found', 'red', 'ring');
            const err = new Error('HAR file not found: ' + harPath);
            if (done) return done(err);
            node.error(err, msg);
            return;
          }
          try {
            harData = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
          } catch (e) {
            setNodeStatus(node, 'HAR file invalid JSON', 'red', 'ring');
            const err = new Error('HAR file is not valid JSON: ' + harPath);
            if (done) return done(err);
            node.error(err, msg);
            return;
          }
        }
      } else if (typeof msg.payload === 'object' && msg.payload !== null) {
        // Assume HAR JSON object
        harData = msg.payload;
      } else {
        setNodeStatus(node, 'msg.payload missing/invalid', 'red', 'ring');
        const err = new Error('msg.payload must be a HAR file path (string), HAR JSON string, or HAR JSON object');
        if (done) return done(err);
        node.error(err, msg);
        return;
      }

      if (!harData.log || !Array.isArray(harData.log.entries)) {
        setNodeStatus(node, 'HAR log.entries missing', 'red', 'ring');
        const err = new Error('HAR data invalid: missing log.entries array');
        if (done) return done(err);
        node.error(err, msg);
        return;
      }
      entries = harData.log.entries;

      // Config parsing/merging
      if (typeof msg.config === 'object' && msg.config !== null) {
        userConfig = msg.config;
      }
      const configUsed = deep_merge(DEFAULT_CONFIG, userConfig);

      // Prepare report
      const report = {
        summary: {
          total_requests: entries.length,
          successful: 0,
          failed: 0,
          timeout: 0,
          error_count: 0,
          average_response_time: null,
          slowest_request: null,
          errors: [],
        },
        overall: {
          overall_completion_time: null,
          overall_transaction_time: null,
          overall_availability: null
        },
        details: [],
        config_used: configUsed
      };

      let response_times = [];
      let availability_count = 0;
      const overall_start = performance.now();

      // Progress feedback
      let processed = 0;
      setNodeStatus(node, `processing 0/${entries.length}`);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Apply method and exclude filters
        if (!is_method_allowed(entry.request.method, configUsed.http_request.method)) continue;
        if (is_url_excluded(entry.request.url, configUsed)) continue;

        try {
          const result = await replay_entry(entry, configUsed);
          report.details.push(result);

          // Update summary
          if (result.error) {
            report.summary.error_count += 1;
            report.summary.errors.push({
              url: result.url,
              error: result.error,
              status: result.status,
            });
            if (result.error && result.error.toLowerCase().includes('timeout')) report.summary.timeout += 1;
            report.summary.failed += 1;
          } else if (result.metrics.availability) {
            report.summary.successful += 1;
          } else {
            report.summary.failed += 1;
          }
          if (result.metrics.transaction_time) response_times.push(result.metrics.transaction_time);
          if (result.metrics.availability) availability_count += 1;
        } catch (err) {
          report.summary.error_count += 1;
          report.summary.failed += 1;
          report.summary.errors.push({
            url: entry.request.url,
            error: err.message,
            status: null,
          });
        }

        processed++;
        if (processed % Math.max(1, Math.floor(entries.length / 10)) === 0) {
          setNodeStatus(node, `processing ${processed}/${entries.length}`);
        }
      }
      const overall_end = performance.now();

      // Overall metrics
      report.overall.overall_completion_time = ms(overall_end - overall_start);
      report.overall.overall_transaction_time = ms(response_times.reduce((a, b) => a + b, 0));
      report.overall.overall_availability = report.details.length
        ? Math.round((availability_count / report.details.length) * 100) / 100
        : null;

      if (response_times.length) {
        report.summary.average_response_time = ms(response_times.reduce((a, b) => a + b, 0) / response_times.length);
        const slowest_idx = response_times.indexOf(Math.max(...response_times));
        report.summary.slowest_request = report.details[slowest_idx] ? report.details[slowest_idx].url : null;
      }

      msg.payload = report;

      setNodeStatus(node, 'done', 'green', 'dot');
      send(msg);
      if (done) done();
    });
  }

  RED.nodes.registerType('http-transaction', HARAnalyserNode);
}