# The following lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.22)

# BlueRetro PS2 Bridge product firmware identity. Keep the version short;
# it is exposed through the firmware-version GATT characteristic.
if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/version.txt")
    file(READ "${CMAKE_CURRENT_LIST_DIR}/version.txt" PROJECT_VER)
    string(STRIP "${PROJECT_VER}" PROJECT_VER)
else()
    set(PROJECT_VER "ps2b-v1.0")
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project("BlueRetroPS2Bridge")
