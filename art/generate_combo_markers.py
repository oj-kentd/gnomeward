"""Small original Blender emblems for gnomes participating in a combo.

Run: blender --background --python art/generate_combo_markers.py
Only writes combo-marker-*.glb and art/combo-markers.blend.
Emblems face +Z in glTF and are centered at the origin for billboarding.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

for name, color in {
    'marker-ivory': (.97, .94, .84), 'marker-lime': (.48, .91, .12),
    'marker-gold': (1.0, .55, .055), 'marker-cyan': (.10, .79, .94),
    'marker-violet': (.54, .17, .93), 'marker-black': (.012, .008, .019),
}.items():
    material = mat(name, color, rough=.45)
    if name != 'marker-black':
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = .40

def rim(color):
    # Open framing helps tiny emblems read over foliage and dark skeletons.
    ring = torus('Ivory emblem edge', (0, .025, 0), .94, .066, 'marker-ivory')
    ring.rotation_euler.x = math.pi / 2
    ring = torus('Colored emblem rim', (0, -.018, 0), .83, .055, color)
    ring.rotation_euler.x = math.pi / 2

reset(); rim('marker-lime')
for i in range(5):
    angle = i * math.tau / 5
    petal = uv('Lime spore petal', (.39 * math.sin(angle), -.015, .39 * math.cos(angle)),
               (.135, .065, .28), 'marker-lime', 10, 6)
    petal.rotation_euler.y = angle
for angle in [0, math.pi / 2]:
    spark = uv('Amber ignition spark', (0, -.095, 0), (.105, .065, .38), 'marker-gold', 10, 6)
    spark.rotation_euler.y = angle
export('combo-marker-sporefire')

reset(); rim('marker-cyan')
vertices = [(0, 0, -.68), (0, 0, .68)]
for i in range(6):
    angle = i * math.tau / 6
    vertices.append((.34 * math.cos(angle), .20 * math.sin(angle), 0))
faces = []
for i in range(6):
    a, b = 2 + i, 2 + (i + 1) % 6
    faces.extend([(0, b, a), (1, a, b)])
mesh = bpy.data.meshes.new('Prismatic emblem gem'); mesh.from_pydata(vertices, [], faces); mesh.update()
gem = bpy.data.objects.new('Prismatic emblem gem', mesh); bpy.context.collection.objects.link(gem)
add(gem, gem.name, (0, 0, 0), (1, 1, 1), 'marker-cyan')
uv('Prism facet glint', (-.10, -.17, .20), (.042, .018, .21), 'marker-ivory', 8, 6)
export('combo-marker-prismstorm')

reset(); rim('marker-violet')
orbit = torus('Violet seed orbit', (0, 0, 0), .47, .074, 'marker-violet')
orbit.rotation_euler = (math.pi / 2, .48, -.25)
orbit.scale = (1.28, .68, 1)
# The ivory outline preserves a black center even against a black hole.
uv('Ivory seed edge', (0, -.03, 0), (.19, .065, .36), 'marker-ivory', 12, 8)
uv('Black singularity seed', (0, -.085, 0), (.135, .062, .29), 'marker-black', 12, 8)
uv('Orbit starlight', (.49, -.04, .25), (.105, .065, .105), 'marker-ivory', 8, 6)
export('combo-marker-berry-singularity')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'art', 'combo-markers.blend'), compress=True)
print('GNOMEWARD_COMBO_MARKERS_COMPLETE')
