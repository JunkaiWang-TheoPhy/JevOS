#!/usr/bin/env python3
"""Build isolated, self-contained Apple Silicon apps from frozen web snapshots."""
import argparse
import hashlib
import io
import json
import os
import plistlib
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "dist"
OLD = Path("/Users/Zhuanz/Documents/Github/Jev-Development")
NEXT = HERE.parents[1]
NODE_HOME = Path("/Users/Zhuanz/.local/opt/node-v22.22.1-darwin-arm64")
CLASSIC_REF = "a2f6551"


def run(args, cwd=HERE, **kwargs):
    if args[0] == "hdiutil":
        # DiskImages needs the current user's GUI bootstrap namespace in Codex App.
        args = ["launchctl", "asuser", str(os.getuid()), "/usr/bin/hdiutil", *args[1:]]
    return subprocess.run([str(x) for x in args], cwd=str(cwd), check=True, **kwargs)


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def tracked_snapshot(destination):
    raw = run(["git", "-C", OLD, "archive", CLASSIC_REF], stdout=subprocess.PIPE).stdout
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for member in archive.getmembers():
            if member.name.startswith("/") or ".." in Path(member.name).parts or member.issym() or member.islnk():
                raise RuntimeError("Unexpected archive member")
        archive.extractall(destination, filter="data")


def source_zip(source, output):
    directories = ["src", "server", "scripts", "tests", "public", "drafts"]
    files = ["package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "index.html",
             "eslint.config.mjs", "playwright.config.ts", "README.md", "README.zh.md", "LICENSE", "THIRD_PARTY.md", ".env.example"]
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            path = source / name
            if path.is_file():
                archive.write(path, name)
        for name in directories:
            root = source / name
            if root.exists():
                for path in sorted(root.rglob("*")):
                    if (path.is_file()
                        and path.suffix not in [".log", ".tsbuildinfo", ".sqlite", ".db", ".sqlite-wal", ".sqlite-shm"]
                        and not path.name.startswith(("diagnose-", "diagnosis-"))
                        and not any(part in ["node_modules", "dist", ".data", ".env.local", "__pycache__"] for part in path.relative_to(source).parts)):
                        archive.write(path, path.relative_to(source))
        archive.write(HERE / "JevOS.swift", "packaging/macos/JevOS.swift")
        archive.write(HERE / "build.py", "packaging/macos/build.py")
    import re
    with zipfile.ZipFile(output) as archive:
        for entry in archive.infolist():
            if Path(entry.filename).name in [".env", ".env.local", "settings.env", "auth.json"]:
                raise RuntimeError("Private configuration appeared in source archive")
            if entry.file_size < 3 * 1024 * 1024 and re.search(rb"apikey_[a-f0-9]{16,}|sk-[A-Za-z0-9_-]{30,}", archive.read(entry)):
                raise RuntimeError("Credential-shaped value appeared in source archive")


def assert_no_private_files(root):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name in [".env", ".env.local", "settings.env", "auth.json", "server.log"] or path.suffix in [".sqlite", ".db", ".sqlite-wal", ".sqlite-shm"]:
            raise RuntimeError("Private runtime data appeared in app bundle: " + path.name)
        if path.suffix in [".mjs", ".js", ".json", ".html", ".env"] and path.stat().st_size < 3 * 1024 * 1024:
            import re
            if re.search(r"apikey_[a-f0-9]{16,}|sk-[A-Za-z0-9_-]{30,}", path.read_text(errors="ignore")):
                raise RuntimeError("Credential-shaped value appeared in app bundle")


def make_icon(source, resources, temp):
    image = source / "dist/icons/pwa-512.png"
    if not image.exists():
        return
    iconset = temp / "AppIcon.iconset"
    iconset.mkdir()
    for size in [16, 32, 128, 256, 512]:
        for scale in [1, 2]:
            target = iconset / (f"icon_{size}x{size}" + ("@2x" if scale == 2 else "") + ".png")
            run(["sips", "-z", size * scale, size * scale, image, "--out", target], stdout=subprocess.DEVNULL)
    run(["iconutil", "-c", "icns", iconset, "-o", resources / "AppIcon.icns"])


def build(flavor, create_dmg):
    label = "JevOS Classic" if flavor == "classic" else "JevOS Next"
    bundle_id = "dev.jevos.classic" if flavor == "classic" else "dev.jevos.next"
    port = 4373 if flavor == "classic" else 4473
    source_root = OLD if flavor == "classic" else NEXT
    if not (source_root / "dist/index.html").exists():
        raise RuntimeError("Build the web snapshot before packaging " + flavor)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="jevos-package-") as directory:
        temp = Path(directory)
        source = temp / "source"
        if flavor == "classic":
            source.mkdir()
            tracked_snapshot(source)
        else:
            source = source_root
        stage = temp / "volume"
        stage.mkdir()
        app = stage / (label + ".app")
        contents = app / "Contents"
        resources = contents / "Resources"
        executable = contents / "MacOS"
        resources.mkdir(parents=True)
        executable.mkdir()
        application = resources / "application"
        application.mkdir()
        shutil.copytree(source / "server", application / "server")
        shutil.copytree(source_root / "dist", application / "dist")
        (application / "node_modules").mkdir()
        shutil.copytree((source_root / "node_modules/zod").resolve(), application / "node_modules/zod")
        (application / "package.json").write_text(json.dumps({"name": "jevos-desktop-runtime", "private": True, "type": "module"}))
        runtime = resources / "runtime"
        runtime.mkdir()
        shutil.copy2(NODE_HOME / "bin/node", runtime / "node")
        licenses = resources / "Licenses"
        licenses.mkdir()
        shutil.copy2(NODE_HOME / "LICENSE", licenses / "Node-LICENSE.txt")
        shutil.copy2(source / "LICENSE", licenses / "JevOS-LICENSE.txt")
        zod_license = source_root / "node_modules/zod/LICENSE"
        if zod_license.exists():
            shutil.copy2(zod_license, licenses / "Zod-LICENSE.txt")
        source_zip(source, resources / "Corresponding-Source.zip")
        manifest = {"flavor": flavor, "displayName": label, "classicServerRef": CLASSIC_REF if flavor == "classic" else None,
                    "architecture": "arm64", "minimumMacOS": "13.0", "nodeVersion": "22.22.1",
                    "webSnapshot": {str(path.relative_to(application / "dist")): digest(path) for path in sorted((application / "dist").rglob("*")) if path.is_file()},
                    "serverSnapshot": {str(path.relative_to(application / "server")): digest(path) for path in sorted((application / "server").rglob("*")) if path.is_file()}}
        (resources / "Snapshot.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
        make_icon(source_root, resources, temp)
        info = {"CFBundleName": label, "CFBundleDisplayName": label, "CFBundleIdentifier": bundle_id,
                "CFBundleExecutable": "JevOS", "CFBundlePackageType": "APPL", "CFBundleVersion": "1",
                "CFBundleShortVersionString": "0.1.0", "LSMinimumSystemVersion": "13.0",
                "CFBundleIconFile": "AppIcon", "NSHighResolutionCapable": True, "JevOSPort": port,
                "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True}}
        with (contents / "Info.plist").open("wb") as output:
            plistlib.dump(info, output)
        run(["swiftc", "-swift-version", "5", "-O", "-target", "arm64-apple-macosx13.0", "-framework", "Cocoa", "-framework", "WebKit", "-framework", "SystemConfiguration", HERE / "JevOS.swift", "-o", executable / "JevOS"])
        assert_no_private_files(app)
        run(["codesign", "--force", "--sign", "-", "--timestamp=none", runtime / "node"])
        run(["codesign", "--force", "--sign", "-", "--timestamp=none", app])
        run(["codesign", "--verify", "--deep", "--strict", app])
        # Only replace artifacts owned by this builder, never a source checkout.
        target_app = OUTPUT / app.name
        if target_app.exists():
            if not (target_app / "Contents/Resources/Snapshot.json").exists():
                raise RuntimeError("Refusing to replace an unrecognized application")
            shutil.rmtree(target_app)
        shutil.copytree(app, target_app)
        print("APP_READY:", target_app, flush=True)
        if create_dmg:
            (stage / "Applications").symlink_to("/Applications", target_is_directory=True)
            (stage / "安装说明.txt").write_text(f"先退出 JevOS，将 {label}.app 拖入 Applications 后打开。\n应用菜单 → 模型设置，填写模型配置。\n支持 Apple Silicon / macOS 13+。\n应用数据目录：~/Library/Application Support/{bundle_id}/。\n")
            dmg = OUTPUT / (label.replace(" ", "-") + "-arm64.dmg")
            hybrid = temp / "payload.dmg"
            writable = temp / "writable.dmg"
            run(["hdiutil", "makehybrid", "-hfs", "-hfs-volume-name", label, "-o", hybrid, stage])
            run(["hdiutil", "convert", hybrid, "-format", "UDRW", "-o", writable])
            mountpoint = temp / "mounted"
            mountpoint.mkdir()
            run(["hdiutil", "attach", "-kernel", "-readwrite", "-nobrowse", "-mountpoint", mountpoint, writable])
            try:
                mounted_app = mountpoint / app.name
                # makehybrid writes empty FinderInfo attributes; strip them before distribution.
                run(["xattr", "-cr", mounted_app])
                run(["codesign", "--verify", "--deep", "--strict", mounted_app])
            finally:
                run(["hdiutil", "detach", mountpoint])
            run(["hdiutil", "convert", writable, "-format", "UDZO", "-ov", "-o", dmg])
            run(["hdiutil", "verify", dmg])
            checksum = digest(dmg)
            (OUTPUT / (dmg.name + ".sha256")).write_text(checksum + "  " + dmg.name + "\n")
            print("DMG_READY:", dmg, "SHA256:", checksum, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--flavor", choices=["classic", "next", "both"], default="both")
    parser.add_argument("--app-only", action="store_true", help="build .app first for native runtime verification")
    parser.add_argument("--next-root", type=Path, help="use a frozen Next source tree with dist and runtime dependencies")
    args = parser.parse_args()
    if args.next_root:
        NEXT = args.next_root.resolve()
    for flavor in (["classic", "next"] if args.flavor == "both" else [args.flavor]):
        build(flavor, not args.app_only)
