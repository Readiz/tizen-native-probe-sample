# Tizen Native Probe

[한국어 안내](README.ko.md)

A Web UI and C++ Native Service sample for exploring Tizen hybrid WGT packaging and checking platform API availability in the **actual application process**.

**Source sample only. No signed WGT or validated Samsung TV native build is provided.** Generic Tizen hybrid packaging documentation does not establish support for a particular Samsung TV SDK, firmware, signing profile, or distribution channel.

## What is included

- Web diagnostics for application identity, platform capabilities, and API object presence.
- A C++ service adapter and Message Port bridge with `ping`, integer `add`, and `probe` requests.
- Read-only Native System Information probes with individual return codes.
- SDK discovery, project creation, and build-command helpers.
- Host C++ tests and JavaScript tests with simulated Message Port APIs.
- [Hybrid architecture and TV applicability](docs/ARCHITECTURE.md), [build instructions](docs/BUILD_GUIDE.md), and [API scope](docs/API_MATRIX.md) in Korean.
- [vconf verification requirements](docs/VCONF.md): SDK headers and libraries, explicit key/type inventory, read/write/change notifications, and permissions in the packaged Native Service.

**vconf calls are not implemented in this version.** The required product keys and value types have not been specified. KeyManager is also not exercised: the Web diagnostic only checks whether its object exists. Neither feature is marked as supported or verified.

## Start with the SDK

Python 3.9 or later is required. On Windows, use `py -3` instead of `python3`.

```sh
python3 scripts/sdk.py doctor --output sdk-report.json
```

If the Tizen CLI is not on `PATH`:

```sh
python3 scripts/sdk.py --tizen "/path/to/SDK/tools/ide/bin/tizen" doctor --output sdk-report.json
```

This inspects the installed templates and rootstraps. It does not install an SDK, create credentials, connect to a TV, or prove TV support. Use the actual TV product SDK and its template names; do not substitute Mobile or Wearable targets. Follow the [build guide](docs/BUILD_GUIDE.md) in this order: Web-only, Native Service, hybrid packaging, then device tests.

## Run without a TV SDK

```sh
python3 scripts/host_test.py
node tests/bridge.test.cjs
node tests/bridge-race.test.cjs
```

The C++ test requires GCC or Clang with C++11 support. JavaScript tests require Node.js; there are no npm runtime dependencies.

To try the simulated UI, open `web/index.html` and select `브라우저 데모 시작`, `데모 연결`, then `연산 요청`. The demo calculates `12 + 30 = 42` in JavaScript. It never silently replaces a failed native connection, and its responses remain marked as simulated.

## Repository map

| Path | Purpose |
| --- | --- |
| `web/` | Web diagnostics and Message Port bridge |
| `native/` | Portable C++ core, Tizen adapter, and optional CMake build |
| `scripts/` | SDK helpers and host tests |
| `tests/` | Bridge tests and an optional browser test |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Web Service versus Native Service, packaging, and TV limits |
| [docs/VCONF.md](docs/VCONF.md) | Required vconf checks and missing inputs |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Implementation and verification status |
| [docs/VALIDATION.md](docs/VALIDATION.md) | Tests performed and remaining device checks |

Generated SDK reports, device diagnostics, credentials, and build outputs are excluded from Git. Review diagnostics before sharing: they can contain local paths, SDK details, or device information.

## Support boundary

Host tests and simulated APIs do not validate the Native adapter against a TV SDK, hybrid installation, real IPC, KeyManager, vconf, or compatibility across model years. A successful shell or system-service call is not evidence that the same call is permitted in this app's Native Service.

The [Tizen development guide](https://github.com/Samsung/tizen-docs/blob/master/docs/application/web/guides/development/index.md#packaging-hybrid-applications) documents hybrid packaging. Samsung's [TV testing FAQ](https://developer.samsung.com/smarttv/develop/faq/application-testing.html) separately states that standalone native TPK applications are unsupported in its public TV testing flow. Neither statement settles hybrid Native Service support for an individual TV product environment.
