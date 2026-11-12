#include "probe_protocol.h"

#include <cstring>
#include <sstream>

namespace cpp_probe {

namespace {

std::string get(const Fields &fields, const char *name)
{
    Fields::const_iterator item = fields.find(name);
    return item == fields.end() ? std::string() : item->second;
}

Fields failure(Fields response, const char *code, const char *message)
{
    response["status"] = "error";
    response["error"] = code;
    response["message"] = message;
    return response;
}

// Accept optional '-' followed by decimal digits, in [-1e9, 1e9].
// The bounded accumulation avoids integer overflow even for malformed input.
bool parse_operand(const std::string &text, long long &result)
{
    if (text.empty() || text.size() > 11)
        return false;

    const bool negative = text[0] == '-';
    std::size_t index = negative ? 1 : 0;
    if (index == text.size())
        return false;

    long long value = 0;
    for (; index < text.size(); ++index) {
        const char ch = text[index];
        if (ch < '0' || ch > '9')
            return false;
        const int digit = ch - '0';
        if (value > (1000000000LL - digit) / 10)
            return false;
        value = value * 10 + digit;
    }
    result = negative ? -value : value;
    return true;
}

std::string integer_string(long long number)
{
    std::ostringstream stream;
    stream << number;
    return stream.str();
}

} // namespace

bool is_allowed_sender(const char *sender, const char *expected_sender)
{
    return sender != NULL && expected_sender != NULL &&
           expected_sender[0] != '\0' && std::strcmp(sender, expected_sender) == 0;
}

Fields handle_request(const Fields &request)
{
    Fields response;
    response["protocol"] = "1";

    const std::string id = get(request, "id");
    const std::string op = get(request, "op");
    // Never echo an unbounded field into a reply.
    response["id"] = id.size() <= 80 ? id : std::string();
    response["op"] = op.size() <= 16 ? op : std::string();

    if (id.empty() || id.size() > 80)
        return failure(response, "INVALID_ID", "id must contain 1 to 80 bytes");
    if (get(request, "protocol") != "1")
        return failure(response, "INVALID_PROTOCOL", "expected protocol 1");
    if (op.empty() || op.size() > 16)
        return failure(response, "INVALID_OP", "op must contain 1 to 16 bytes");

    response["status"] = "ok";
    if (op == "ping") {
        response["message"] = "pong";
    } else if (op == "add") {
        long long a = 0;
        long long b = 0;
        if (!parse_operand(get(request, "a"), a) ||
            !parse_operand(get(request, "b"), b)) {
            return failure(response, "INVALID_OPERAND",
                           "a and b must be decimal integers from -1000000000 to 1000000000");
        }
        response["result"] = integer_string(a + b);
    } else if (op == "probe") {
        // The Tizen adapter fills actual runtime results after this validation.
        response["probe_scope"] = "listed_calls_only";
    } else {
        return failure(response, "UNKNOWN_OP", "supported operations: ping, add, probe");
    }
    return response;
}

} // namespace cpp_probe
