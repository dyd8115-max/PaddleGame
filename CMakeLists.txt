cmake_minimum_required(VERSION 3.15)
project(PaddleBreakout LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(PaddleBreakout WIN32
    src/main.cpp
    src/Game.cpp
    src/Game.h
    src/GameObjects.h
    src/Geometry.h
)

target_link_libraries(PaddleBreakout PRIVATE gdi32 msimg32 winmm)

if(MSVC)
    target_compile_options(PaddleBreakout PRIVATE /utf-8 /W4)
    # Visual Studio 에서 실행할 때 작업 폴더를 실행 파일 폴더로
    set_property(TARGET PaddleBreakout PROPERTY VS_DEBUGGER_WORKING_DIRECTORY "$<TARGET_FILE_DIR:PaddleBreakout>")
else()
    target_compile_options(PaddleBreakout PRIVATE -Wall -Wextra -Wno-unknown-pragmas)
endif()

# 그림·소리 파일을 실행 파일 옆으로 복사
add_custom_command(TARGET PaddleBreakout POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        ${CMAKE_SOURCE_DIR}/resources/characters.bmp
        ${CMAKE_SOURCE_DIR}/resources/bgm.wav
        ${CMAKE_SOURCE_DIR}/resources/start.wav
        $<TARGET_FILE_DIR:PaddleBreakout>
)
