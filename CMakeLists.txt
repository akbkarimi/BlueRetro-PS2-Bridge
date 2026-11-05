# The following lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.22)

# MethyleneX firmware version. Shows up in the boot log, in `esptool
# read_flash` info and — most importantly — in the WebApp Home page (the
# a09 firmware-version GATT read), so a stale/cached build can never be
# mistaken for the freshly flashed one again.
set(PROJECT_VER "mx-v6")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project("BlueRetro$ENV{BR_HW}$ENV{BR_SYS}")
