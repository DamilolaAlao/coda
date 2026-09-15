# HTTP client

The right panel includes an **HTTP** surface for sending REST requests from the connected
environment — the same idea as Insomnia or Kong's API client, without leaving the thread.

Open it from the panel launcher (`H` while the empty launcher is showing), the **+** menu, the
command palette (**Toggle HTTP client**), or `mod+shift+u`. Requests are named and kept per
environment in the browser.

Send goes through that environment's server, so you can hit local APIs and hosts that a browser tab
would block with CORS. Use Query, Headers, Body, and Auth the way you would in a dedicated REST
client. Bearer and basic credentials are stored with the request on this machine.

The environment also publishes its HTTP control API at `/openapi.json` and a Scalar reference at
`/docs` on the same origin as the server.
