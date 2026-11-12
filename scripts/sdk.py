#!/usr/bin/env python3
"""Inspect a real SDK and create/build its own projects. Python standard library only.

This helper does not install an SDK, select a mobile rootstrap as a TV target,
manufacture a .cproject, create certificates, or connect to a TV automatically.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import shlex
import shutil
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WEB_NAME = "WebUI"
NATIVE_NAME = "NativeService"
PACKAGE_ID = "CppProbe01"


def find_cli(explicit=None):
    candidate = explicit or os.environ.get("TIZEN_CLI") or shutil.which("tizen") or shutil.which("tizen.bat")
    if candidate and Path(candidate).is_file():
        return str(Path(candidate).resolve())
    if candidate and shutil.which(candidate):
        return shutil.which(candidate)
    return None


def display(command):
    return subprocess.list2cmdline(command) if os.name == "nt" else shlex.join(command)


def run(command, cwd=None, timeout=180):
    print("$ " + display(command), flush=True)
    return subprocess.run(command, cwd=cwd, check=True, timeout=timeout)


def require_cli(args):
    cli = find_cli(args.tizen)
    if not cli:
        raise RuntimeError("Tizen CLI를 찾지 못했습니다. SDK의 tools/ide/bin을 PATH에 추가하거나 --tizen 경로를 지정하세요.")
    return cli


def doctor(args):
    cli = find_cli(args.tizen)
    result = {
        "schema": "tizen-sdk-doctor/1", "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "tizen_cli": cli, "sdb": shutil.which("sdb"), "cmake": shutil.which("cmake"),
        "host_cxx": shutil.which("g++") or shutil.which("clang++"),
        "target_support": "not_determined", "commands": [],
        "note": "목록에 이름이 있는 것과 TV 빌드/설치 성공은 별도입니다. 인증서와 비밀값은 수집하지 않습니다."
    }
    if cli:
        for suffix in (["version"], ["list", "web-project"], ["list", "native-project"], ["list", "rootstrap"]):
            command = [cli] + suffix
            try:
                proc = subprocess.run(command, capture_output=True, text=True, errors="replace", timeout=45)
                result["commands"].append({"args": suffix, "exit_code": proc.returncode, "output": (proc.stdout + proc.stderr)[-50000:]})
            except (OSError, subprocess.TimeoutExpired) as error:
                result["commands"].append({"args": suffix, "error": str(error)})
    else:
        result["blocker"] = "Tizen CLI 미설치 또는 PATH 미설정. host C++ compiler만으로 TV Native 앱을 빌드할 수 없습니다."
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        destination = Path(args.output)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(rendered + "\n", encoding="utf-8")
    return 0 if cli else 2


def copy_tree(source, destination):
    for item in source.rglob("*"):
        relative = item.relative_to(source)
        if any(part.startswith(".") for part in relative.parts):
            continue
        target = destination / relative
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)


def local_tag(element):
    return element.tag.rsplit("}", 1)[-1]


def update_manifest(path):
    tree = ET.parse(path)
    root = tree.getroot()
    services = [x for x in root if local_tag(x) == "service-application"]
    if len(services) != 1 or any(local_tag(x) == "ui-application" for x in root):
        raise RuntimeError("선택한 Native 템플릿은 단일 Service 프로젝트가 아닙니다. 실제 SDK의 Service 템플릿을 선택하세요.")
    root.set("package", PACKAGE_ID)
    root.set("version", "0.1.0")
    service = services[0]
    service.set("appid", PACKAGE_ID + "." + NATIVE_NAME)
    service.set("exec", NATIVE_NAME)
    service.set("on-boot", "false")
    service.set("auto-restart", "false")
    service.set("multiple", "false")
    # Keep the SDK's real profile, api-version, metadata and toolchain settings.
    if root.tag.startswith("{"):
        ET.register_namespace("", root.tag[1:].split("}", 1)[0])
    tree.write(path, encoding="utf-8", xml_declaration=True)


def set_reference(path):
    tree = ET.parse(path)
    root = tree.getroot()
    projects = root.find("projects")
    if projects is None:
        projects = ET.SubElement(root, "projects")
    if not any(x.text == NATIVE_NAME for x in projects.findall("project")):
        ET.SubElement(projects, "project").text = NATIVE_NAME
    tree.write(path, encoding="utf-8", xml_declaration=True)


def create_workspace(args, hybrid):
    cli = require_cli(args)
    dest = Path(args.dest).resolve()
    if dest.exists():
        raise RuntimeError("출력 폴더가 이미 있습니다. 기존 작업을 보존하기 위해 중단합니다. 새 --dest를 지정하세요: " + str(dest))
    for value in ([args.native_profile] if hybrid else []):
        if any(part in value.lower() for part in ("mobile", "wearable")):
            raise RuntimeError("TV 샘플에 mobile/wearable Native profile을 사용하지 않습니다. 실제 TV 제품 SDK 대상을 선택하세요.")
    dest.mkdir(parents=True)
    run([cli, "create", "web-project", "-p", args.web_profile, "-t", args.web_template, "-n", WEB_NAME, "--", str(dest)])
    web = dest / WEB_NAME
    if not (web / ".project").is_file():
        raise RuntimeError("SDK가 예상한 WebUI/.project를 생성하지 않았습니다. CLI 출력과 출력 경로를 확인하세요.")
    copy_tree(ROOT / "web", web)
    if hybrid:
        run([cli, "create", "native-project", "-p", args.native_profile, "-t", args.native_template, "-n", NATIVE_NAME, "--", str(dest)])
        native = dest / NATIVE_NAME
        if not (native / ".cproject").is_file():
            raise RuntimeError("SDK가 NativeService/.cproject를 생성하지 않았습니다. 해당 SDK 방식으로 프로젝트를 생성하세요.")
        update_manifest(native / "tizen-manifest.xml")
        # Only replace stubs in the NEW project just created by this command.
        for name in ("src", "inc"):
            folder = native / name
            if folder.is_symlink():
                raise RuntimeError("SDK 템플릿의 소스 폴더가 symlink입니다. 자동 overlay를 중단합니다.")
            if folder.exists():
                shutil.rmtree(folder)
        copy_tree(ROOT / "native" / "src", native / "src")
        copy_tree(ROOT / "native" / "include", native / "inc")
        set_reference(web / ".project")
    info = {"schema": "tizen-probe-workspace/1", "hybrid": hybrid, "package_id": PACKAGE_ID,
            "web_profile": args.web_profile, "native_profile": args.native_profile if hybrid else None,
            "generated_by": "real Tizen CLI", "native_build_verified": False}
    (dest / "probe-workspace.json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("SDK 프로젝트와 샘플 소스를 준비했습니다: " + str(dest))
    if hybrid:
        print("다음: docs/BUILD_GUIDE.md의 C++ linker, inc 경로, SDK별 library/framework 설정을 적용한 뒤 빌드하세요.")
    return 0


def build_web(args):
    cli = require_cli(args)
    project = Path(args.workspace).resolve() / WEB_NAME
    if not (project / ".project").is_file():
        raise RuntimeError("먼저 create-web/create-hybrid로 SDK Web 프로젝트를 생성하세요.")
    run([cli, "build-web", "--", str(project)])
    run([cli, "package", "-t", "wgt", "-s", args.sign_profile, "--", str(project / ".buildResult")])
    print("이 명령은 Web-only 패키징입니다. Native Service는 포함하지 않습니다.")
    return 0


def hybrid_command(args, execute):
    if any(part in args.rootstrap.lower() for part in ("mobile", "wearable")):
        raise RuntimeError("TV 제품용 rootstrap을 지정하세요. 모바일/웨어러블 대상을 TV 타깃으로 사용하지 않습니다.")
    cli = require_cli(args) if execute else (find_cli(args.tizen) or "tizen")
    rootstraps = json.dumps([{"name": args.rootstrap, "platform": args.platform, "arch": args.arch}], separators=(",", ":"))
    method = "name:m1,compiler:" + args.compiler + ",rootstraps:" + rootstraps + ",configs:[" + args.configuration + "]"
    command = [cli, "build-app", "-m", method,
               "-b", "name:b1,targets:[WebUI,NativeService],methods:[m1]",
               "-p", "name:ProbeHybrid,targets:[b1]", "-s", args.sign_profile,
               "--", str(Path(args.workspace).resolve())]
    if not execute:
        print(display(command))
        print("명령 생성만 수행했습니다. 실제 SDK 빌드와 패키징은 실행하지 않았습니다.")
        return 0
    workspace = Path(args.workspace).resolve()
    for name, meta in ((WEB_NAME, ".project"), (NATIVE_NAME, ".cproject")):
        if not (workspace / name / meta).is_file():
            raise RuntimeError("SDK 프로젝트가 없습니다: " + str(workspace / name / meta))
    run(command, cwd=workspace, timeout=600)
    print("SDK 명령이 성공했습니다. 산출물 확인 후 실제 TV 설치와 API 호출을 따로 검증하세요.")
    return 0


def inspect_package(args):
    path = Path(args.package).resolve()
    result = {"package": path.name, "signature_validation": "not_performed", "elf_files": [], "xml_ids": [], "nested_packages": []}
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        result["signature_files_present"] = {name: name in names for name in ("author-signature.xml", "signature1.xml")}
        for item in archive.infolist():
            if item.is_dir():
                continue
            if item.filename.lower().endswith((".tpk", ".wgt")):
                result["nested_packages"].append(item.filename)
            with archive.open(item) as stream:
                head = stream.read(20)
            if head[:4] == b"\x7fELF" and len(head) >= 20:
                endian = "<" if head[5] == 1 else ">"
                machine = struct.unpack(endian + "H", head[18:20])[0]
                result["elf_files"].append({"path": item.filename, "bits": {1: 32, 2: 64}.get(head[4]),
                                            "machine": {3: "x86", 40: "ARM", 62: "x86_64", 183: "AArch64"}.get(machine, machine)})
            if item.filename.endswith(("config.xml", "tizen-manifest.xml")) and item.file_size < 1000000:
                try:
                    root = ET.fromstring(archive.read(item))
                    attrs = [{"tag": local_tag(x), "attributes": dict(x.attrib)} for x in root.iter()
                             if local_tag(x) in ("application", "service-application", "manifest", "profile")]
                    result["xml_ids"].append({"path": item.filename, "ids": attrs})
                except ET.ParseError as error:
                    result["xml_ids"].append({"path": item.filename, "parse_error": str(error)})
    result["note"] = "ELF 존재나 서명 파일 존재만으로 설치/서명 유효성/TV API 지원을 보증하지 않습니다. 중첩 패키지 내부는 검사하지 않았습니다."
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tizen", help="Tizen CLI 실행 파일 경로. 생략 시 TIZEN_CLI 또는 PATH")
    sub = parser.add_subparsers(dest="action", required=True)
    doc = sub.add_parser("doctor", help="설치된 SDK 템플릿과 rootstrap 조회")
    doc.add_argument("--output", help="진단 JSON을 저장할 경로")
    for name in ("create-web", "create-hybrid"):
        p = sub.add_parser(name, help="실제 SDK 템플릿으로 새 프로젝트 생성 후 샘플 소스 복사")
        p.add_argument("--dest", required=True)
        p.add_argument("--web-profile", required=True)
        p.add_argument("--web-template", required=True)
        if name == "create-hybrid":
            p.add_argument("--native-profile", required=True)
            p.add_argument("--native-template", required=True)
    p = sub.add_parser("build-web", help="SDK가 생성한 WebUI만 빌드하고 서명")
    p.add_argument("--workspace", required=True)
    p.add_argument("--sign-profile", required=True)
    for name in ("hybrid-command", "build-hybrid"):
        p = sub.add_parser(name, help="공식 build-app hybrid 명령 생성/실행")
        p.add_argument("--workspace", required=True)
        p.add_argument("--rootstrap", required=True)
        p.add_argument("--platform", required=True)
        p.add_argument("--arch", required=True)
        p.add_argument("--compiler", required=True, choices=("gcc", "llvm"))
        p.add_argument("--configuration", default="Debug", choices=("Debug", "Release"))
        p.add_argument("--sign-profile", required=True)
    p = sub.add_parser("inspect-package", help="WGT 내부의 XML ID와 ELF 아키텍처 확인")
    p.add_argument("package")
    args = parser.parse_args()
    try:
        if args.action == "doctor": return doctor(args)
        if args.action.startswith("create-"): return create_workspace(args, args.action == "create-hybrid")
        if args.action == "build-web": return build_web(args)
        if args.action in ("hybrid-command", "build-hybrid"): return hybrid_command(args, args.action == "build-hybrid")
        if args.action == "inspect-package": return inspect_package(args)
    except (RuntimeError, OSError, ET.ParseError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        print("중단: " + str(error), file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
