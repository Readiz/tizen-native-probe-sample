#include "probe_protocol.h"

#include <cstdio>
#include <string>

namespace {

int failures = 0;
int checks = 0;

void expect(bool passed, const char *name)
{
    ++checks;
    if (!passed) {
        ++failures;
        std::fprintf(stderr, "FAIL: %s\n", name);
    }
}

cpp_probe::Fields request(const char *op)
{
    cpp_probe::Fields fields;
    fields["protocol"] = "1";
    fields["id"] = "host-test-1";
    fields["op"] = op;
    return fields;
}

void expect_add(const char *a, const char *b, const char *expected)
{
    cpp_probe::Fields fields = request("add");
    fields["a"] = a;
    fields["b"] = b;
    cpp_probe::Fields response = cpp_probe::handle_request(fields);
    expect(response["status"] == "ok" && response["result"] == expected, "add result");
}

} // namespace

int main()
{
    cpp_probe::Fields fields = request("ping");
    cpp_probe::Fields response = cpp_probe::handle_request(fields);
    expect(response["status"] == "ok" && response["message"] == "pong", "ping");
    expect(response["id"] == fields["id"] && response["protocol"] == "1", "request correlation");
    expect(response.count("runtime") == 0 && response.count("native_api") == 0,
           "host core must not claim a native runtime");

    expect_add("3", "4", "7");
    expect_add("-8", "3", "-5");
    expect_add("1000000000", "1000000000", "2000000000");
    expect_add("-1000000000", "-1000000000", "-2000000000");
    expect_add("-0", "0", "0");

    const char *invalid[] = {"", "-", "+1", "1.2", "1e2", " 1", "1 ", "NaN",
                             "1000000001", "-1000000001", "9999999999999999999999"};
    for (unsigned int i = 0; i < sizeof(invalid) / sizeof(invalid[0]); ++i) {
        fields = request("add");
        fields["a"] = invalid[i];
        fields["b"] = "0";
        response = cpp_probe::handle_request(fields);
        expect(response["status"] == "error" && response["error"] == "INVALID_OPERAND",
               "invalid operand is rejected");
    }

    fields = request("add");
    fields["a"] = "1";
    response = cpp_probe::handle_request(fields);
    expect(response["error"] == "INVALID_OPERAND", "missing operand is rejected");

    fields = request("ping");
    fields["protocol"] = "2";
    response = cpp_probe::handle_request(fields);
    expect(response["error"] == "INVALID_PROTOCOL", "protocol mismatch");

    fields = request("ping");
    fields["id"] = std::string(81, 'x');
    response = cpp_probe::handle_request(fields);
    expect(response["error"] == "INVALID_ID" && response["id"].empty(), "oversized id is not echoed");
    fields["id"] = std::string(80, 'x');
    response = cpp_probe::handle_request(fields);
    expect(response["status"] == "ok", "80-byte id boundary");
    fields.erase("id");
    response = cpp_probe::handle_request(fields);
    expect(response["error"] == "INVALID_ID", "missing id");

    fields = request("unknown");
    response = cpp_probe::handle_request(fields);
    expect(response["error"] == "UNKNOWN_OP", "unknown operation");
    fields["op"] = std::string(17, 'x');
    response = cpp_probe::handle_request(fields);
    expect(response["error"] == "INVALID_OP" && response["op"].empty(), "oversized op");

    fields = request("probe");
    response = cpp_probe::handle_request(fields);
    expect(response["status"] == "ok" && response["probe_scope"] == "listed_calls_only",
           "probe is validated but not performed on host");
    expect(response.count("model_name_status") == 0, "no invented platform results");

    expect(cpp_probe::is_allowed_sender("CppProbe01.WebUI", "CppProbe01.WebUI"), "expected sender");
    expect(!cpp_probe::is_allowed_sender("CppProbe01.Other", "CppProbe01.WebUI"), "unexpected sender");
    expect(!cpp_probe::is_allowed_sender(NULL, "CppProbe01.WebUI"), "null sender");
    expect(!cpp_probe::is_allowed_sender("", ""), "empty allowlist is rejected");

    std::printf("Host C++ core: %d checks, %d failures. Tizen IPC/API/device behavior was not tested.\n",
                checks, failures);
    return failures == 0 ? 0 : 1;
}
