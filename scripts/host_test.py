#!/usr/bin/env python3
"""Compile and run only the portable C++ request core. This is not a TV build."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cxx', default=shutil.which('g++') or shutil.which('clang++'))
args = parser.parse_args()
if not args.cxx:
    parser.error('g++ 또는 clang++가 필요합니다. TV SDK는 이 host 테스트에 사용하지 않습니다.')
native = Path(__file__).resolve().parents[1] / 'native'
with tempfile.TemporaryDirectory(prefix='tizen_probe_host_') as temp:
    output = Path(temp) / 'protocol_test'
    command = [args.cxx, '-std=c++11', '-O2', '-Wall', '-Wextra', '-Wpedantic', '-Werror',
               '-I' + str(native / 'include'), str(native / 'src/probe_protocol.cpp'),
               str(native / 'tests/protocol_test.cpp'), '-o', str(output)]
    subprocess.run(command, check=True)
    subprocess.run([str(output)], check=True)
