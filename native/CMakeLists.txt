cmake_minimum_required(VERSION 3.12)
project(CppProbeNative LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Default configuration is deliberately host-only. It cannot produce a TV app.
option(PROBE_BUILD_TIZEN "Build the actual Tizen Native Service using a product SDK" OFF)
option(PROBE_ENABLE_SYSTEM_INFO "Link and call Tizen system_info probes" ON)
set(PROBE_NATIVE_APP_ID "CppProbe01.NativeService" CACHE STRING "Native application ID")
set(PROBE_EXPECTED_WEB_APP_ID "CppProbe01.WebUI" CACHE STRING "Allowed Web application ID")
set(PROBE_PORT_NAME "CPP_PROBE_SERVICE" CACHE STRING "Native message port name")
set(PROBE_SDK_BUILD_LABEL "product SDK version not supplied" CACHE STRING "Label copied into probe output")

add_library(probe_protocol STATIC src/probe_protocol.cpp)
target_include_directories(probe_protocol PUBLIC include)
set_target_properties(probe_protocol PROPERTIES POSITION_INDEPENDENT_CODE ON)

if(NOT PROBE_BUILD_TIZEN)
    add_executable(protocol_test tests/protocol_test.cpp)
    target_link_libraries(protocol_test PRIVATE probe_protocol)
    enable_testing()
    add_test(NAME host_protocol COMMAND protocol_test)
    message(STATUS "HOST ONLY: no Tizen API or TV executable is being built.")
    return()
endif()

# Do not silently use the PC compiler and headers for a TV deliverable.
if(NOT CMAKE_TOOLCHAIN_FILE)
    message(FATAL_ERROR "PROBE_BUILD_TIZEN requires the product SDK CMAKE_TOOLCHAIN_FILE. See native/README.md.")
endif()
if(NOT CMAKE_CROSSCOMPILING)
    message(FATAL_ERROR "Tizen build must use a cross-compiling toolchain. Host tests use PROBE_BUILD_TIZEN=OFF.")
endif()

find_package(PkgConfig REQUIRED)
# Candidate .pc names vary by SDK. A found candidate is then checked by the real
# compiler/linker below. Supply exact lists when your product SDK uses others.
set(PROBE_SERVICE_PC "capi-appfw-service-application;service-app" CACHE STRING "Service API .pc candidates")
set(PROBE_MESSAGE_PC "capi-message-port;message-port" CACHE STRING "Message Port .pc candidates")
set(PROBE_BUNDLE_PC "bundle" CACHE STRING "Bundle .pc candidates")
set(PROBE_SYSTEM_PC "capi-system-info;system-info" CACHE STRING "System Information .pc candidates")
pkg_search_module(TIZEN_SERVICE REQUIRED IMPORTED_TARGET ${PROBE_SERVICE_PC})
pkg_search_module(TIZEN_MESSAGE REQUIRED IMPORTED_TARGET ${PROBE_MESSAGE_PC})
pkg_search_module(TIZEN_BUNDLE REQUIRED IMPORTED_TARGET ${PROBE_BUNDLE_PC})

set(PROBE_LIBS PkgConfig::TIZEN_SERVICE PkgConfig::TIZEN_MESSAGE PkgConfig::TIZEN_BUNDLE)
if(PROBE_ENABLE_SYSTEM_INFO)
    pkg_search_module(TIZEN_SYSTEM REQUIRED IMPORTED_TARGET ${PROBE_SYSTEM_PC})
    list(APPEND PROBE_LIBS PkgConfig::TIZEN_SYSTEM)
endif()

add_executable(NativeService src/service.cpp)
target_link_libraries(NativeService PRIVATE probe_protocol ${PROBE_LIBS})
target_compile_definitions(NativeService PRIVATE
    PROBE_NATIVE_APP_ID="${PROBE_NATIVE_APP_ID}"
    PROBE_EXPECTED_WEB_APP_ID="${PROBE_EXPECTED_WEB_APP_ID}"
    PROBE_PORT_NAME="${PROBE_PORT_NAME}"
    PROBE_SDK_BUILD_LABEL="${PROBE_SDK_BUILD_LABEL}"
    PROBE_ENABLE_SYSTEM_INFO=$<BOOL:${PROBE_ENABLE_SYSTEM_INFO}>
)
message(STATUS "Tizen modules: ${TIZEN_SERVICE_MODULE_NAME}; ${TIZEN_MESSAGE_MODULE_NAME}; ${TIZEN_BUNDLE_MODULE_NAME}")
if(PROBE_ENABLE_SYSTEM_INFO)
    message(STATUS "System Info module: ${TIZEN_SYSTEM_MODULE_NAME}")
endif()
message(STATUS "Output is an ELF executable. SDK manifest, signing, hybrid packaging and TV execution are still required.")
