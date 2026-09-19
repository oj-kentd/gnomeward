"""Original Blender orbit ribbons for Strawberry + Orbit's hidden combo.

Run: blender --background --python art/generate_berry_singularity.py
Writes three GLBs and art/berry-singularity.blend. Flying seeds reuse the
existing black strawberry-seed.glb; there is no opaque explosion mesh.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

for name, color, emission in [
    ('singularity-violet', (.48, .16, .91), .65),
    ('singularity-starlight', (.93, .88, 1.0), .5),
]:
    material = mat(name, color, metal=.12, rough=.34)
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission

def arc(name, start, sweep, radius, width, material):
    # Tapered, rounded ribbons leave large gaps and an entirely open center.
    vertices, faces = [], []
    segments, sides = 18, 6
    for i in range(segments + 1):
        phase = i / segments
        angle = start + phase * sweep
        thickness = width * (.10 + .90 * math.sin(phase * math.pi))
        for side in range(sides):
            tube = side * math.tau / sides
            radial = radius + math.cos(tube) * thickness
            vertices.append((radial * math.cos(angle), radial * math.sin(angle), math.sin(tube) * thickness * .48))
    for i in range(segments):
        for side in range(sides):
            a = i * sides + side; b = i * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range(segments * sides, (segments + 1) * sides))])
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    add(obj, name, (0, 0, 0), (1, 1, 1), material)
    for face in mesh.polygons: face.use_smooth = True

reset()
for i in range(3):
    angle = i * math.tau / 3
    arc('Violet orbit ribbon', angle, math.pi * .43, 1.0, .035, 'singularity-violet')
    arc('White inner orbit ribbon', angle + .27, math.pi * .30, .79, .018, 'singularity-starlight')
export('berry-singularity-arcs')

reset()
for i in range(9):
    angle = i * math.tau / 9 + .20
    radius = .70 + .26 * (i % 3) / 2
    # Tiny four-point toy stars catch the light around the black seed spiral.
    for turn in [0, math.pi / 2]:
        star = uv('Singularity star', (radius * math.cos(angle), radius * math.sin(angle), .05 * (i % 2)),
                  (.054, .012, .009), 'singularity-starlight', 8, 6)
        star.rotation_euler.z = angle + turn
export('berry-singularity-stars')
reset()
# A narrow open outline makes the still-black seed legible over a black hole.
# This lies in the seed's long-axis plane and does not cover its black center.
outline = torus('Charged seed starlight outline', (0, 0, 0), 1, .065, 'singularity-starlight')
outline.rotation_euler.x = math.pi / 2
outline.scale = (.51, 1.13, 1)
export('berry-singularity-seed-ring')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'art', 'berry-singularity.blend'), compress=True)
print('GNOMEWARD_BERRY_SINGULARITY_COMPLETE')
