#ifndef CPP_PROBE_PROTOCOL_H
#define CPP_PROBE_PROTOCOL_H

#include <map>
#include <string>

namespace cpp_probe {

typedef std::map<std::string, std::string> Fields;

// Pure C++ request handling. No Tizen headers, IPC, or platform calls here.
Fields handle_request(const Fields &request);
bool is_allowed_sender(const char *sender, const char *expected_sender);

} // namespace cpp_probe

#endif
