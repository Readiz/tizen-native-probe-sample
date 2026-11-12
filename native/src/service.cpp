#include "probe_config.h"
#include "probe_protocol.h"

#include <bundle.h>
#include <message_port.h>
#include <service_app.h>
#if PROBE_ENABLE_SYSTEM_INFO
#include <system_info.h>
#endif

#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>

namespace {

struct ServiceState {
    int port_id;
};

std::string as_string(long long value)
{
    std::ostringstream output;
    output << value;
    return output.str();
}

const char *architecture()
{
#if defined(__aarch64__)
    return "aarch64";
#elif defined(__arm__)
    return "arm";
#elif defined(__x86_64__)
    return "x86_64";
#elif defined(__i386__)
    return "x86";
#else
    return "unknown";
#endif
}

// Extract only known small fields. The framework owns incoming bundle memory.
bool copy_field(bundle *message, const char *key, std::size_t limit,
                cpp_probe::Fields &request)
{
    char *value = NULL;
    if (bundle_get_str(message, key, &value) != 0 || value == NULL)
        return true; // Missing/wrong-type required fields are rejected by the core.
    std::size_t length = 0;
    while (length <= limit && value[length] != '\0')
        ++length;
    if (length > limit)
        return false;
    request[key] = std::string(value, length);
    return true;
}

#if PROBE_ENABLE_SYSTEM_INFO

const char *system_error_name(int code)
{
    switch (code) {
    case SYSTEM_INFO_ERROR_NONE: return "SYSTEM_INFO_ERROR_NONE";
    case SYSTEM_INFO_ERROR_INVALID_PARAMETER: return "SYSTEM_INFO_ERROR_INVALID_PARAMETER";
    case SYSTEM_INFO_ERROR_OUT_OF_MEMORY: return "SYSTEM_INFO_ERROR_OUT_OF_MEMORY";
    case SYSTEM_INFO_ERROR_IO_ERROR: return "SYSTEM_INFO_ERROR_IO_ERROR";
    case SYSTEM_INFO_ERROR_PERMISSION_DENIED: return "SYSTEM_INFO_ERROR_PERMISSION_DENIED";
    default: return "unmapped_system_info_error";
    }
}

void add_string_probe(cpp_probe::Fields &response, const char *name, const char *key)
{
    char *value = NULL;
    const int code = system_info_get_platform_string(key, &value);
    const std::string field(name);
    response[field + "_key"] = key;
    response[field + "_code"] = as_string(code);
    response[field + "_error"] = system_error_name(code);
    response[field + "_status"] = code == SYSTEM_INFO_ERROR_NONE && value != NULL
                                      ? "ok" : "error";
    if (code == SYSTEM_INFO_ERROR_NONE && value != NULL)
        response[field + "_value"] = value;
    if (code == SYSTEM_INFO_ERROR_NONE && value == NULL)
        response[field + "_error"] = "success_returned_without_string";
    std::free(value);
}

void add_bool_probe(cpp_probe::Fields &response, const char *name, const char *key)
{
    bool value = false;
    const int code = system_info_get_platform_bool(key, &value);
    const std::string field(name);
    response[field + "_key"] = key;
    response[field + "_code"] = as_string(code);
    response[field + "_error"] = system_error_name(code);
    response[field + "_status"] = code == SYSTEM_INFO_ERROR_NONE ? "ok" : "error";
    if (code == SYSTEM_INFO_ERROR_NONE)
        response[field + "_value"] = value ? "true" : "false";
}

#endif

void add_runtime_probe(cpp_probe::Fields &response)
{
    response["architecture"] = architecture();
#ifdef __VERSION__
    response["compiler"] = __VERSION__;
#else
    response["compiler"] = "not reported";
#endif
    response["cpp_standard"] = as_string(__cplusplus);
    response["sdk_build_label"] = PROBE_SDK_BUILD_LABEL;
    response["service_app_status"] = "running";
    response["message_port_status"] = "request_received";
    response["keymanager_status"] = "not_tested";

#if PROBE_ENABLE_SYSTEM_INFO
    response["native_api"] = "service_app,message_port,system_info";
    response["system_info_build_status"] = "linked";
    add_string_probe(response, "model_name", "http://tizen.org/system/model_name");
    add_string_probe(response, "platform_version", "http://tizen.org/feature/platform.version");
    add_bool_probe(response, "web_service", "http://tizen.org/feature/web.service");
    add_bool_probe(response, "wifi", "http://tizen.org/feature/network.wifi");
#else
    response["native_api"] = "service_app,message_port";
    response["system_info_build_status"] = "disabled_at_build";
    response["model_name_status"] = "not_built";
    response["platform_version_status"] = "not_built";
    response["web_service_status"] = "not_built";
    response["wifi_status"] = "not_built";
#endif
}

void receive_message(int local_port_id, const char *remote_app_id,
                     const char *remote_port, bool trusted_remote_port,
                     bundle *message, void * /*user_data*/)
{
    if (!cpp_probe::is_allowed_sender(remote_app_id, PROBE_EXPECTED_WEB_APP_ID)) {
        std::fprintf(stderr, "CppProbe: rejected unexpected sender\n");
        return;
    }
    if (message == NULL || remote_port == NULL || remote_port[0] == '\0') {
        std::fprintf(stderr, "CppProbe: request has no message or reply port\n");
        return;
    }

    bundle *reply = NULL;
    try {
        cpp_probe::Fields request;
        const bool bounded =
            copy_field(message, "protocol", 8, request) &&
            copy_field(message, "id", 80, request) &&
            copy_field(message, "op", 16, request) &&
            copy_field(message, "a", 32, request) &&
            copy_field(message, "b", 32, request);

        cpp_probe::Fields response = cpp_probe::handle_request(request);
        if (!bounded) {
            response["status"] = "error";
            response["error"] = "FIELD_TOO_LONG";
            response["message"] = "a request field exceeded its byte limit";
        }
        response["runtime"] = "tizen-native";
        response["native_app_id"] = PROBE_NATIVE_APP_ID;
        if (bounded && response["status"] == "ok" && response["op"] == "probe")
            add_runtime_probe(response);

        reply = bundle_create();
        if (reply == NULL) {
            std::fprintf(stderr, "CppProbe: cannot allocate reply\n");
            return;
        }
        for (cpp_probe::Fields::const_iterator item = response.begin();
             item != response.end(); ++item) {
            if (bundle_add_str(reply, item->first.c_str(), item->second.c_str()) != 0) {
                bundle_free(reply);
                reply = NULL;
                std::fprintf(stderr, "CppProbe: cannot populate reply\n");
                return;
            }
        }

        // Include our actual local port identity so Web can validate the source
        // of this response, rather than trusting fields inside the payload.
        const int code = trusted_remote_port
            ? message_port_send_trusted_message_with_local_port(
                  remote_app_id, remote_port, reply, local_port_id)
            : message_port_send_message_with_local_port(
                  remote_app_id, remote_port, reply, local_port_id);
        bundle_free(reply);
        reply = NULL;
        if (code != MESSAGE_PORT_ERROR_NONE)
            std::fprintf(stderr, "CppProbe: response send failed: %d\n", code);
    } catch (...) {
        if (reply != NULL)
            bundle_free(reply);
        // Do not let C++ exceptions cross the framework's C callback boundary.
        std::fprintf(stderr, "CppProbe: exception while handling request\n");
    }
}

bool service_create(void *user_data)
{
    ServiceState *state = static_cast<ServiceState *>(user_data);
    state->port_id = message_port_register_local_port(PROBE_PORT_NAME, receive_message, state);
    if (state->port_id < 0) {
        std::fprintf(stderr, "CppProbe: port registration failed: %d\n", state->port_id);
        return false;
    }
    return true;
}

void service_terminate(void *user_data)
{
    ServiceState *state = static_cast<ServiceState *>(user_data);
    if (state->port_id >= 0) {
        const int code = message_port_unregister_local_port(state->port_id);
        if (code != MESSAGE_PORT_ERROR_NONE)
            std::fprintf(stderr, "CppProbe: port removal failed: %d\n", code);
        state->port_id = -1;
    }
}

void service_control(app_control_h /*app_control*/, void * /*user_data*/)
{
    // AppControl may launch this service. Payloads arrive through Message Port.
}

} // namespace

int main(int argc, char **argv)
{
    ServiceState state = {-1};
    service_app_lifecycle_callback_s callbacks = {};
    callbacks.create = service_create;
    callbacks.terminate = service_terminate;
    callbacks.app_control = service_control;
    return service_app_main(argc, argv, &callbacks, &state);
}
