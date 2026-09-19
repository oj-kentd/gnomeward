"""Original Blender-made Sporefire and Prismstorm combat effects.

Run: blender --background --python art/generate_combo_assets.py
Only writes combo GLBs under public/assets and art/combos.blend.
Open centers keep skeletons and the path visible. Joined, material-batched
meshes keep each burst inexpensive; all motion is presentation-only.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

for name, color in {
    'spore-lime': (.56, .94, .12), 'spore-violet': (.61, .18, .88),
    'combo-amber': (1.0, .59, .085), 'prism-ice': (.19, .88, 1.0),
    'prism-rose': (.97, .20, .69), 'prism-gold': (1.0, .77, .23),
}.items():
    material = mat(name, color, metal=.10, rough=.38)
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = .32

reset()
# Soft pollen petals alternate around a deliberately empty center.
for i in range(10):
    angle = i * math.tau / 10
    radius = .72 if i % 2 else .84
    petal = uv('Pollen petal', (radius * math.cos(angle), radius * math.sin(angle), .025),
               (.18, .065, .046), 'spore-lime' if i % 2 else 'spore-violet', 10, 6)
    petal.rotation_euler.z = angle
# Ten separated little arcs, rather than a solid colored blast disc.
for i in range(10):
    angle = (i + .25) * math.tau / 10
    petal = uv('Pollen inner arc', (.46 * math.cos(angle), .46 * math.sin(angle), .015),
               (.04, .095, .025), 'spore-lime', 8, 6)
    petal.rotation_euler.z = angle
export('sporefire-petals')

reset()
for i in range(12):
    angle = i * math.tau / 12
    radius = .62 + .32 * (i % 3) / 2
    spark = ico('Golden popping spore', (radius * math.cos(angle), radius * math.sin(angle), .06 * (i % 3)),
                (.033, .033, .075), 'combo-amber')
    spark.rotation_euler.y = .6
export('combo-sparks')

def shard(name, location, scale, material):
    # A toy-cut hexagonal gem with pointed ends. Long axis exports along Y.
    vertices = [(0, 0, -.82), (0, 0, .82)]
    for i in range(6):
        angle = i * math.tau / 6
        vertices.append((.30 * math.cos(angle), .30 * math.sin(angle), 0))
    faces = []
    for i in range(6):
        a, b = 2 + i, 2 + (i + 1) % 6
        faces.extend([(0, b, a), (1, a, b)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    return add(obj, name, location, scale, material)

reset(); shard('Flying prism shard', (0, 0, 0), (1, 1, 1), 'prism-ice'); export('prism-shard')
reset()
for i in range(12):
    angle = i * math.tau / 12
    radius = .58 + .28 * (i % 2)
    obj = shard('Prismatic star petal', (radius * math.cos(angle), radius * math.sin(angle), .035),
                (.22, .22, .16), ['prism-ice', 'prism-rose', 'prism-gold'][i % 3])
    obj.rotation_euler = (math.pi / 2, 0, angle)
export('prism-burst')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'art', 'combos.blend'), compress=True)
print('GNOMEWARD_COMBO_ASSETS_COMPLETE')
