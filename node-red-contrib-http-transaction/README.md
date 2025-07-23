# node-red-contrib-http-transaction

A Node-RED node for advanced HTTP transaction analysis, replay, and monitoring. This package enables you to replay HTTP requests from HAR files, analyze responses, and generate detailed reports for web performance, availability, and content verification.

## Features

- **Replay HTTP requests** from HAR files with configurable HTTP versions, methods, headers, and more.
- **Analyze responses** for status, timing, content, and download limits.
- **Generate detailed reports** including metrics like transaction time, availability, slow/failed requests, and more.
- **Customizable configuration** for request/response, server timing, and exclusions.
- **Ideal for web monitoring, regression testing, and performance analysis.**

## Installation

Install via npm in your Node-RED user directory:

```bash
npm install node-red-contrib-http-transaction
```


## Usage

### 1. Add the Node to Your Flow

- Open the Node-RED editor in your browser.
- In the palette, find the `http-transaction` node (it may appear under a custom category).
- Drag the node into your flow.

### 2. Configure the Node

Double-click the node to open its configuration panel. You can set:

#### HTTP Request Options
- **HTTP Version:** Choose between `1.1` or `2`.
- **Method:** Select one or more HTTP methods (GET, POST, etc.).
- **Follow Redirects:** Enable/disable automatic redirect following.
- **Custom Headers:** Add any headers required for your requests.
- **User Agent:** Specify a custom user agent string.
- **Agent Options:** Set `keep_alive` and `reject_unauthorized` as needed.

#### HTTP Response Options
- **Desired Status Code:** The expected HTTP status code (e.g., `200`).
- **Verify Content:** Provide a string or pattern to check in the response body.
- **Limit Download Size (KB):** Restrict the maximum download size.

#### Server Timing
- **Timeout (sec):** Set a timeout for each request.
- **Target Response Time (ms):** Define what is considered a “slow” response.

#### Exclusions
- **Domains:** List domains to exclude from replay.
- **Object URLs:** List specific URLs to exclude.

### 3. Provide Input

The node expects input in the form of a HAR file or an array of HAR request entries. You can:

- Use a `file in` node to read a HAR file and pass its contents to the `http-transaction` node.
- Or, construct HAR request entries programmatically and send them as the `msg.payload`.

### 4. Run the Flow

- Deploy your flow.
- Trigger the input (inject node, file read, etc.).
- The `http-transaction` node will replay the requests, analyze responses, and output a report.

### 5. Review the Output

The node outputs a `HARAnalyserReport` object, which includes:

- **summary:** Total requests, successful/failed counts, average response time, errors, etc.
- **overall:** Overall completion and transaction times, availability.
- **details:** Array of per-request results with timings, status, errors, and metrics.
- **config_used:** The configuration used for the run.

You can connect a `debug` node to the output to inspect the report.

### 6. Example Flow

Here’s a simple example:

1. Use an `inject` node to trigger the flow.
2. Use a `file in` node to read a HAR file.
3. Connect the output to the `http-transaction` node.
4. Connect the output to a `debug` node to view the report.

### 7. Advanced Usage

- Use function nodes to dynamically build or filter HAR entries.
- Chain with other nodes to automate monitoring, alerting, or logging based on the report.

### 8. TypeScript Support

If developing custom logic, use the provided TypeScript types (`types.d.ts`) for strong typing of configuration, request entries, and reports.

## Example Output

```json
{
  "summary": {
    "total_requests": 10,
    "successful": 8,
    "failed": 2,
    "timeout": 1,
    "error_count": 2,
    "average_response_time": 320,
    "slowest_request": "https://example.com/api/slow",
    "errors": [ ... ]
  },
  "overall": {
    "overall_completion_time": 1500,
    "overall_transaction_time": 1200,
    "overall_availability": 0.8
  },
  "details": [ ... ],
  "config_used": { ... }
}
```

## TypeScript Types

The package provides TypeScript types for configuration, request entries, replay results, and reports. See `types.d.ts` for details.

## API Reference

### HTTPTransactionConfig
- Configure HTTP request/response, server timing, and exclusions.

### HARRequestEntry
- Represents a single HTTP request from a HAR file.

### HARReplayResult
- Contains the result and metrics for each replayed request.

### HARAnalyserReport
- The main report object with summary, overall, and detailed results.

## Contributing

Contributions are welcome! Please open issues or pull requests for improvements or bug fixes.

## License

MIT
