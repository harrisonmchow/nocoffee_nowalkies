"""Author the tent ObjectSculptSpec on top of the generated starter (idempotent).

All reconstruction decisions (dimensions, pole layout, membrane solve, materials) live here and
in the resulting spec; src/scripts/camp/tent.ts implements them.
Run: python3 .img2threejs/build_spec.py
"""
import json
from pathlib import Path

W = Path(__file__).parent
P = W / "object-sculpt-spec.json"
s = json.loads(P.read_text())
_starter = json.loads((W / "starter-spec.json").read_text())  # schema templates only
base_c = _starter["componentTree"][0]
base_m = _starter["materials"][0]

L, D, H = 1.05, 0.65, 0.9  # half length (x), half depth (z), hub height
HUB_Z = 0.2  # two hubs, front and back, offset from the ridge line (review blockout #1)
HUB = [0.0, H, HUB_Z]
HUB_BACK = [0.0, H, -HUB_Z]
RIDGE_MID = [0.0, 1.0, 0.0]
RIDGE_END = 0.58
CORNER = [L, 0.0, D]


def comp(cid, name, level, role, parent, primitive, topo, rationale, material, dims, conf,
         pos=(0, 0, 0), descriptor=None, features=None, attachment=None, anim="static",
         pivot_mode="center", collider="box", evidence=("full-object",), layers=None):
    c = json.loads(json.dumps(base_c))
    c.update(id=cid, name=name, level=level, role=role, parent=parent, primitive=primitive,
             topologyClass=topo, topologyRationale=rationale, material=material,
             materialLayers=layers or [material], confidence=conf, importance=1.0 if level == "macro" else 0.6,
             fidelityTier="form", evidenceRefs=list(evidence))
    c["dimensions"] = dict(width=dims[0], height=dims[1], depth=dims[2], units="m", confidence=conf)
    c["transform"] = dict(position=list(pos), rotation=[0, 0, 0], scale=[1, 1, 1])
    gd = c["geometryDescriptor"]
    gd.update(descriptor or {})
    c["localFeatures"] = features or []
    c["attachment"] = attachment
    ap = c["actionProfile"]
    ap["animationRole"] = anim
    ap["pivot"]["mode"] = pivot_mode
    ap["pivot"]["localPosition"] = list(pos)
    ap["collider"]["type"] = collider
    ap["destruction"]["fractureGroup"] = cid
    ap["destruction"]["debrisMaterial"] = material
    return c


def attach(parent_socket, start, end, contact="socket", embed=0.01):
    return dict(parentSocket=parent_socket, localStart=start, localEnd=end, contactType=contact,
                embedDepth=embed, overlap=embed, gapTolerance=0.005)


def feat(fid, kind, desc, detail_id, **extra):
    f = dict(id=fid, kind=kind, description=desc, detailRef=detail_id, evidenceRef="full-object")
    f.update(extra)
    return f


membrane = {
    "topologyIntent": "single heightfield membrane over the footprint, solved as a pinned Laplace membrane with a small sag load",
    "membraneSolve": {
        "footprintHalfExtents": [L, D], "hemHeight": 0.04, "grid": [56, 36],
        "gridWarp": "x = L*sin(a*pi/2), z = D*sin(b*pi/2) (dense at walls)",
        "pins": ["hem perimeter at hemHeight", "4 leg arches minus pole clearance 0.012",
                 "roof plateau |x|<=RIDGE_END, |z|<=HUB_Z at 0.86..0.89 (hung from both hubs, ridge-pole ears at the ends)", "end-wall seam lines ear->hem midpoint, straight (form-refinement: keeps end panels planar, IMG_4850)"],
        "heightRemap": "solve u, y = HEM + (1-HEM)*u^0.55 so walls leave the hem steeply",
        "sagLoad": -0.9, "iterations": 500,
        "wrinkles": "seeded value noise, amplitude 4.5 mm, horizontal bias on lower faces"},
    "uvStrategy": "accumulated surface arc length along grid rows/cols (cloth-style unwrap)",
    "normalStrategy": "computeVertexNormals + generated canvas normal map (ripstop + soft wrinkles)",
}

ct = [
    comp("root", "tent", "macro", "body", None, "box", "assembled-solid",
         "Assembly root only; carries no geometry.", "fly-nylon", [2.1, 1.0, 1.3], 0.85,
         descriptor={"topologyIntent": "empty group, base centred at y=0, door +Z"}, anim="root"),
    comp("fly", "fly", "macro", "shell", "root", "extrude", "open-shell",
         "Coated-nylon fly is a zero-thickness tensioned membrane seen from outside and (when faded) from inside.",
         "fly-nylon", [2.1, 0.92, 1.3], 0.8, descriptor=membrane,
         features=[
             feat("fabric-sag", "seam", "membrane sag load between pinned pole lines + wrinkle noise", "fabric-sag", geometryEffect="displacement"),
             feat("panel-seams", "seam", "faint seam tubes along end-wall/face boundaries (hub->ridge-end, ridge-end->corner)", "panel-seams", geometryEffect="ridge"),
             feat("velcro-wraps", "fastener", "pale green webbing loops on the fly next to each leg at ~45% height", "velcro-wraps", geometryEffect="small box"),
             feat("hem-gap", "stain", "hem 4 cm above ground; dark inner floor band below", "hem-gap", geometryEffect="separate inner skirt"),
         ], layers=["fly-nylon"]),
    comp("inner-floor", "inner-floor", "meso", "base", "fly", "extrude", "open-shell",
         "Visible only as a dark band under the hem; a thin skirt inset 2 cm inside the hem.",
         "inner-floor", [2.04, 0.06, 1.26], 0.5, descriptor={"inferred": True},
         attachment=attach("fly.hem", [0, 0, 0], [0, 0.06, 0], "overlap", 0.02)),
    comp("poles", "poles", "macro", "frame", "root", "tube", "fiber-strand",
         "Frame group: hub, strut, four legs and the ridge pole; aluminium tube 9 mm.", "aluminium",
         [2.1, 1.0, 1.3], 0.8, descriptor={"tubeRadius": 0.0045}),
    comp("frame-hub", "hub-front", "meso", "connector", "poles", "cylinder", "assembled-solid",
         "Front moulded hub at the top of the door face; two front legs and a strut socket in.", "hub-alloy", [0.05, 0.03, 0.05], 0.75, pos=HUB,
         features=[feat("hub-strut-junction", "fastener", "hub body + strut leaning back up to the ridge fitting", "hub-strut-junction")],
         attachment=attach("poles.hub", HUB, HUB, "socket", 0.01)),
    comp("frame-hub-back", "hub-back", "meso", "connector", "poles", "cylinder", "assembled-solid",
         "Back hub, mirror of the front one (IMG_4850 shows it with its own legs).", "hub-alloy", [0.05, 0.03, 0.05], 0.6, pos=HUB_BACK,
         attachment=attach("poles.hubBack", HUB_BACK, HUB_BACK, "socket", 0.01), evidence=("full-object", "secondary-view")),
    comp("ridge-strut", "ridge-struts", "micro", "connector", "poles", "tube", "fiber-strand",
         "Two short struts, one from each hub, leaning in to the ridge-pole centre fitting.", "aluminium", [0.01, 0.1, 0.4], 0.7,
         attachment=attach("frame-hub.top", HUB, RIDGE_MID, "socket", 0.01)),
    comp("ridge-pole", "ridge-pole", "meso", "connector", "poles", "curve-sweep", "fiber-strand",
         "Lengthwise ridge pole, arched, proud of the fly; ends hook down to the fly ridge corners.", "aluminium",
         [1.06, 0.14, 0.01], 0.8,
         descriptor={"curve": "catmull-rom", "points": [[-RIDGE_END - 0.02, 0.86, 0], [-0.3, 0.97, 0], [0, 1.0, 0], [0.3, 0.97, 0], [RIDGE_END + 0.02, 0.86, 0]]},
         features=[feat("ridge-arch", "contour", "arch 1.0 m at mid, 0.86 at ends, ~8 cm above fly at mid", "ridge-pole-proud")],
         attachment=attach("ridge-strut.top", RIDGE_MID, RIDGE_MID, "socket", 0.01)),
    comp("pole-legs", "legs", "meso", "connector", "frame-hub", "curve-sweep", "fiber-strand",
         "Four legs, each from its own side's hub to a corner, in vertical planes; profile h(s)=H*(1-s)+0.26*sin(pi*s)*sqrt(s).", "aluminium",
         [2.06, 0.92, 1.26], 0.75,
         descriptor={"curve": "catmull-rom per leg", "profile": "h(s) = 0.9*(1 - s) + 0.26*sin(pi*s)*sqrt(s), s = 0..1 hub->corner", "corners": [[sx * CORNER[0], 0, sz * CORNER[2]] for sx in (-1, 1) for sz in (-1, 1)]},
         features=[feat("leg-clips", "fastener", "4 black clips per leg at s = 0.2,0.4,0.6,0.8", "leg-clips", repetitionSystem="leg-clips")],
         attachment=attach("frame-hub.legSockets", HUB, CORNER, "socket", 0.01)),
    comp("door", "door", "meso", "panel", "fly", "extrude", "open-shell",
         "Door panel conforms to the +Z face of the membrane, 3 mm proud, D-shaped (inferred outline).",
         "fly-nylon", [0.84, 0.66, 0.02], 0.35, pos=[-0.42, 0.05, 0.6],
         descriptor={"outline": "D: base |x|<=0.42 at y=0.05, top at y=0.68 under the vent", "inferred": True},
         features=[feat("door-zip", "linework", "dark coil-zip tube along the D outline", "door-zip"),
                   feat("door-toggle", "fastener", "small pale tab at door centre", "door-toggle")],
         attachment=attach("fly.doorHinge", [-0.42, 0.05, 0.6], [-0.42, 0.6, 0.35], "overlap", 0.003),
         anim="hinge", pivot_mode="edge", layers=["fly-nylon", "zip"]),
    comp("awning", "awning", "meso", "panel", "fly", "extrude", "open-shell",
         "Peaked vent hood under the hub on the door face: two triangular flaps meeting at a ridge, propped by a kickstand.",
         "fly-nylon", [0.38, 0.18, 0.12], 0.8, pos=[0, 0.8, 0.14],
         features=[feat("peaked-vent-hood", "seam", "hood apex at hub, opening at y~0.72, projects 10 cm", "door-vent-awning"),
                   feat("kickstand", "fastener", "short strut + dark webbing tab in the opening", "door-vent-awning")],
         attachment=attach("fly.ventFront", [0, 0.9, 0.05], [0, 0.72, 0.2], "overlap", 0.003)),
    comp("vent-back", "vent-back", "meso", "panel", "fly", "extrude", "open-shell",
         "Mirror of the door vent hood on the -Z face (seen in IMG_4850).", "fly-nylon", [0.38, 0.18, 0.12], 0.6,
         pos=[0, 0.8, -0.14], features=[feat("peaked-vent-hood", "seam", "mirror of awning", "back-vent")],
         attachment=attach("fly.ventBack", [0, 0.9, -0.05], [0, 0.72, -0.2], "overlap", 0.003),
         evidence=("full-object", "secondary-view")),
]
s["componentTree"] = ct


def mat(mid, name, color, rough, metal, notes, palette=None, double=False, overrides=None, bands=None):
    m = json.loads(json.dumps(base_m))
    m.update(id=mid, name=name, baseColor=color, color=color, notes=notes, doubleSided=double)
    m["shaderModel"] = "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)"
    m["albedo"] = dict(dominant=color, secondary=palette or [], samplingNotes="de-lit (see material evidence)")
    m["colorVariation"]["palette"] = [color] + (palette or [])
    m["colorVariation"]["amplitude"] = 0.04
    m["roughness"] = dict(base=rough, variation=0.08, map="independent-procedural-field", localResponse=m["roughness"]["localResponse"])
    m["metalness"] = dict(base=metal, variation=0.0)
    m["localOverrides"] = overrides or []
    if bands:
        m["surfaceFrequencyBands"] = bands
    return m


fly_bands = [
    {"id": "macro", "frequency": 1.5, "amplitude": 0.03, "role": "membrane sag between pinned pole lines (geometry)"},
    {"id": "meso", "frequency": 14.0, "amplitude": 0.004, "role": "soft wrinkles, horizontal bias (geometry noise + normal map)"},
    {"id": "micro", "frequency": 180.0, "amplitude": 0.002, "role": "ripstop grid ~5 mm (normal map only)"},
]
s["materials"] = [
    mat("fly-nylon", "fly ripstop nylon", "#9aa891", 0.62, 0.0,
        "Semi-matte silicone/PU-coated ripstop. Colour de-lit from dusk reference; sheen from roughness 0.62 + normal map.",
        palette=["#8e9c86", "#a6b39d"], double=True,
        overrides=[{"id": "crease-sheen", "detailRef": "crease-sheen", "channel": "roughness", "value": 0.5,
                    "region": "upper taut panels", "implementation": "roughnessMap from the same canvas as the normal map (independent channel)"}],
        bands=fly_bands),
    mat("aluminium", "pole aluminium", "#b9bcbd", 0.45, 0.8, "Dull anodised aluminium tube, 9 mm."),
    mat("hub-alloy", "hub", "#d6d8d6", 0.5, 0.3, "Pale grey hub/fitting."),
    mat("clip-black", "pole clips", "#1d1f20", 0.7, 0.0, "Black moulded plastic clips."),
    mat("webbing", "green webbing loops", "#b8c7a8", 0.85, 0.0, "Pale sage webbing/velcro."),
    mat("inner-floor", "inner bathtub floor", "#2a3032", 0.8, 0.0, "Dark inner floor visible beneath hem (inferred colour).", double=True),
    mat("zip", "door zip coil", "#3a403c", 0.6, 0.0, "Coil zip, slightly darker than fly."),
]
# ---- material evidence wiring (material-evidence/summary.json) ----
ev = json.loads((W / "material-evidence" / "summary.json").read_text())["decided"]
mats = {m["id"]: m for m in s["materials"]}
fly_m = mats["fly-nylon"]
fly_m.update(baseColor=ev["fly-nylon"]["baseColor"], color=ev["fly-nylon"]["baseColor"])
fly_m["albedo"]["dominant"] = ev["fly-nylon"]["baseColor"]
fly_m["albedo"]["secondary"] = ["#8d9c8f", "#a3b1a3"]
fly_m["colorVariation"]["palette"] = [ev["fly-nylon"]["baseColor"], "#8d9c8f", "#a3b1a3"]
fly_m["roughness"].update(base=ev["fly-nylon"]["roughness"], variation=0.12)
fly_m["normal"].update(strength=ev["fly-nylon"]["normalStrength"], pattern="generated canvas: ripstop grid + soft wrinkles (independent of albedo)")
fly_m["localOverrides"][0]["roughness"] = ev["fly-nylon"]["creaseSheenRoughness"]
fly_m["textureResolution"] = 1024
fly_m["referencePbr"] = {
    "usable": True, "confidence": 0.751, "source": "material-evidence/fly-pbr.json",
    "whiteBalance": "material-evidence/summary.json#whiteBalance",
    "maps": {ch: {"path": f"material-evidence/fly/fly-nylon_{ch}.png"} for ch in ("albedo", "roughness", "height", "normal", "ao")},
    "use": "statistics only (roughness/normal strength); albedo palette rejected as blue-cast; runtime maps are generated in code"}
for mid in ("aluminium", "hub-alloy", "clip-black", "webbing", "inner-floor", "zip"):
    m = mats[mid]
    if mid in ev:
        m.update(baseColor=ev[mid]["baseColor"], color=ev[mid]["baseColor"])
        m["albedo"]["dominant"] = ev[mid]["baseColor"]
    m["qualityTier"] = "utility"
    m["qualityTierRationale"] = "thin or tiny part (< 2 cm across in the reference); no croppable texture evidence"

for c in ct:
    m = mats[c["material"]]
    hexc = m["baseColor"].lstrip("#")
    r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    dark = tuple(max(0, int(v * 0.86)) for v in (r, g, b))
    c["colorMaterialRecipe"] = {
        "dominantAlbedo": f"rgba({r}, {g}, {b}, 1.0)", "secondaryAlbedo": f"rgba({dark[0]}, {dark[1]}, {dark[2]}, 1.0)",
        "materialClass": {"fly-nylon": "fabric", "webbing": "fabric", "inner-floor": "fabric", "zip": "plastic",
                          "clip-black": "plastic", "hub-alloy": "plastic", "aluminium": "metal"}[c["material"]],
        "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}
ct[0]["attachment"] = None
ct[3]["attachment"] = attach("root.frame", HUB, CORNER, "socket", 0.01)  # poles group

s["lightingFromPhoto"] = [
    {"type": "environment", "description": "dusk skydome, strong blue zenith, no direct sun (sun below horizon); exposure low; ACES-style tone in phone pipeline"},
    {"type": "fill", "description": "soft ground bounce from pale quartz sand and green heath on lower faces"},
    {"type": "key", "description": "none direct; brightest irradiance on up-facing roof from zenith; door face mid value"},
    {"type": "rim", "description": "faint warm western sky glow on pole tops"},
    {"type": "contact shadow", "description": "dark ambient occlusion band under the hem where the inner floor meets ground"},
    {"type": "runtime", "description": "the model adds NO lights: the camp scene's hemisphere/sun rig lights it; tone mapping and exposure come from the scene renderer"},
]

# detail refs use component/feature form
by_feat = {}
for c in ct:
    for f in c["localFeatures"]:
        by_feat.setdefault(f["detailRef"], f"{c['id']}/{f['id']}")
for d in s["preSpecAssessment"]["detailInventory"]["details"]:
    if d["id"] == "crease-sheen":
        d["mapsTo"]["ref"] = "fly-nylon/crease-sheen"
    elif d["id"] in by_feat:
        d["mapsTo"]["ref"] = by_feat[d["id"]]

s["repetitionSystems"] = [
    {"id": "leg-clips", "componentRef": "pole-legs", "instance": "clip (box 22x10x14 mm)", "count": 16,
     "distribution": "linear along each leg at s = 0.2, 0.4, 0.6, 0.8", "material": "clip-black",
     "implementation": "InstancedMesh", "evidenceRefs": ["full-object"]},
    {"id": "velcro-loops", "componentRef": "fly", "instance": "webbing loop", "count": 4,
     "distribution": "one per leg at s ~0.55, beside the leg", "material": "webbing",
     "implementation": "InstancedMesh", "evidenceRefs": ["full-object"]},
]
s["featureReviewTargets"] = [
    {"id": "overall-silhouette", "name": "Low wide ridge-dome silhouette, long axis X, door trapezoid with ridge ~half base", "tier": "critical",
     "passIds": ["blockout"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["fly"], "evidenceRefs": ["full-object"]},
    {"id": "pole-system", "name": "Two hubs (front/back) + 4 legs outside the fly, raised ridge pole on two struts", "tier": "critical",
     "passIds": ["structural-pass", "form-refinement"], "minimumScore": 0.75, "mustPass": True,
     "componentRefs": ["frame-hub", "frame-hub-back", "ridge-pole", "pole-legs", "ridge-strut"], "evidenceRefs": ["full-object"]},
    {"id": "door-vent-awning", "name": "Peaked vent hood under the hub on the door face", "tier": "critical",
     "passIds": ["structural-pass", "form-refinement"], "minimumScore": 0.7, "mustPass": True,
     "componentRefs": ["awning"], "evidenceRefs": ["full-object"]},
    {"id": "fly-material", "name": "De-lit sage semi-matte nylon with sag and soft wrinkles", "tier": "critical",
     "passIds": ["material-pass", "surface-pass"], "minimumScore": 0.7, "mustPass": True,
     "componentRefs": ["fly"], "evidenceRefs": ["full-object"]},
    {"id": "clips-and-loops", "name": "Black clips along legs; green loops", "tier": "important",
     "passIds": ["form-refinement"], "minimumScore": 0.6, "mustPass": False,
     "componentRefs": ["pole-legs", "fly"], "evidenceRefs": ["full-object"]},
]
for fr in s["featureReviewTargets"]:
    fr.setdefault("evidenceRefs", ["full-object"])

s["coordinateFrame"] = {"front": "+Z (door face)", "up": "+Y", "units": "metres", "origin": "base centre at y=0",
                        "scaleReference": "2.1 m long (X) x 1.3 m deep (Z) x 1.0 m high; scene refits to 2.6 m"}
s["silhouette"] = {"boundingShape": "low ridge-dome over a 2.1 x 1.3 m rectangle",
                   "aspectRatios": [{"pair": "length:depth", "value": 1.62}, {"pair": "length:height", "value": 2.1}],
                   "symmetry": "bilateral about X=0 and approximately about Z=0",
                   "dominantCurves": ["leg arches hub->corners", "ridge pole arch"],
                   "negativeSpaces": ["gap between ridge pole and fly roof"],
                   "landmarks": ["apex hub", "ridge-pole ends at fly ridge corners", "vent hood under hub"]}
s["viewEvidence"] = [
    {"id": "full-object", "view": "primary IMG_4842 door three-quarter", "imageRegion": {"x": 0, "y": 0, "width": 1, "height": 1, "units": "normalized"},
     "observations": ["door face trapezoid", "hub + inverted-V legs", "ridge pole proud of fly", "vent hood under hub", "clips"], "confidence": 0.85},
    {"id": "secondary-view", "view": "IMG_4850 opposite three-quarter (lower half occluded)", "imageRegion": {"x": 0, "y": 0, "width": 1, "height": 1, "units": "normalized"},
     "observations": ["far-side legs from hub", "second vent hood", "ridge pole continues over top"], "confidence": 0.55},
]
s["referenceCamera"].update(note="Approximate: camera ~4.5 m from the door face, ~1.6 m eye height, yawed ~18 deg toward -X, FOV ~45 (phone main lens). Not solved; review render matches it by hand.",
                            fovDegrees=45.0, positionHint=[-1.3, 1.6, 4.3])
s["assumptions"] = [
    "INFERRED: back (-Z) face mirrors the door face below 40% height (occluded in IMG_4850).",
    "INFERRED: hem 4 cm above ground everywhere; ground line hidden in both photos.",
    "OMITTED: stakes and guy-lines (not visible in either photo).",
    "INFERRED (low confidence 0.35): door D-outline and zip line; not resolvable at dusk.",
    "CORRECTED brief: hub + 4 legs (not two crossing poles); no brow pole; peaked awning is a vent hood.",
]
s["risks"] = ["heightfield cannot overhang; walls near hem are steep but not vertical",
              "door outline inferred", "no visual hull: proportions are by-eye from non-orthographic photos"]
s["performanceBudget"].update(targetTriangles=12000, maxDrawCalls=20, textureSize=512, fpsTarget=60)
s["scores"] = {"object_isolation": 2, "silhouette_readability": 3, "depth_inference": 2, "primitive_decomposition": 3,
               "material_procedurality": 3, "occlusion_risk": 2, "interaction_fit": 3}
s["actionReadiness"]["runtimeContract"] = {
    "factory": "createTentModel(): THREE.Group in src/scripts/camp/tent.ts",
    "namedNodes": ["fly", "poles", "door", "awning"], "sculptRuntime": "root.userData.sculptRuntime.door = door pivot Group",
    "materials": "MeshStandardMaterial only; no lights; no ground plane"}
for bp in s["buildPasses"]:
    bp["componentRefs"] = [c["id"] for c in ct] if bp["id"] != "blockout" else ["root", "fly", "poles"]
psa = s["preSpecAssessment"]
if psa.get("unknownsToResolveBeforeImplementation"):
    psa["resolvedUnknowns"] = [{"unknown": u, "resolution": "decided as inferred/omitted; see assumptions[] and per-region confidence"}
                               for u in psa["unknownsToResolveBeforeImplementation"]]
    psa["unknownsToResolveBeforeImplementation"] = []
P.write_text(json.dumps(s, indent=2))
print("wrote", P)
