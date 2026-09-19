"""Original Blender accessories for endless skeleton defenses.

Run: blender --background --python art/generate_enemy_traits.py
Exports trait-armored/runed/toxic.glb and art/enemy-traits.blend.
Small static accessories face +Z in glTF and fit the standard skeleton.
Vertex colors batch each accessory into one shared-material draw call.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))

for name, color in {
    'trait-steel': (.23, .32, .40), 'trait-bronze': (.72, .40, .12),
    'trait-ivory': (.92, .96, .95), 'trait-sigil': (.19, .88, 1.0),
    'trait-slate': (.035, .09, .15), 'trait-acid': (.34, .88, .055),
    'trait-acid-glint': (.77, 1.0, .30),
}.items(): mat(name, color, rough=.45)

def batched_export(name, roughness=.55, metal=0, emission=None):
    # Retain the Blender-authored palette in COLOR_0, so joining parts does not
    # leave many material groups on each of a crowd's repeated accessories.
    material = mat(name + '-paint', (1, 1, 1), metal=metal, rough=roughness)
    shader = material.node_tree.nodes.get('Principled BSDF')
    color_node = material.node_tree.nodes.new('ShaderNodeVertexColor')
    color_node.layer_name = 'Color'
    material.node_tree.links.new(color_node.outputs['Color'], shader.inputs['Base Color'])
    if emission:
        shader.inputs['Emission Color'].default_value = (*emission, 1)
        shader.inputs['Emission Strength'].default_value = .45
    for obj in parts:
        mesh = obj.data
        colors = mesh.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
        for polygon in mesh.polygons:
            color = mesh.materials[polygon.material_index].diffuse_color
            for loop_index in polygon.loop_indices: colors.data[loop_index].color = color
            polygon.material_index = 0
        mesh.materials.clear(); mesh.materials.append(material)
    return export(name)

reset()
# A padded toy-metal buckler, offset from the ribs so the skeleton's HP color
# and face remain visible. Front is Blender -Y / exported glTF +Z.
uv('Bronze buckler rim', (-.28, -.23, .77), (.235, .065, .29), 'trait-bronze', 16, 10)
uv('Steel buckler face', (-.28, -.28, .77), (.19, .035, .245), 'trait-steel', 16, 10)
uv('Buckler center boss', (-.28, -.324, .77), (.073, .027, .073), 'trait-bronze', 10, 6)
for x, z in [(-.28, .97), (-.28, .57), (-.44, .77), (-.12, .77)]:
    uv('Buckler rivet', (x, -.30, z), (.020, .012, .020), 'trait-ivory', 8, 6)
batched_export('trait-armored', roughness=.38, metal=.48)

reset()
# A rune worn on the sternum, visibly separate from gnome hat-top combo badges.
plaque = cube('Small rune plaque', (0, -.17, .85), (.25, .046, .34), 'trait-slate', .035)
for a, b in [((-.07, -.205, .85), (0, -.205, .98)), ((0, -.205, .98), (.07, -.205, .85)),
             ((.07, -.205, .85), (0, -.205, .72)), ((0, -.205, .72), (-.07, -.205, .85)),
             ((0, -.212, .76), (0, -.212, .94))]:
    rod('Glowing rune stroke', a, b, .016, 'trait-sigil')
uv('Rune heart', (0, -.224, .85), (.028, .018, .028), 'trait-ivory', 8, 6)
batched_export('trait-runed', roughness=.5, emission=(.025, .13, .20))

reset()
# Five permanent bubbles at the shoulders, not a cloud or runtime particles.
for x, y, z, size in [(-.29, -.02, 1.06, .084), (-.37, .015, .94, .055),
                       (.29, -.015, 1.06, .075), (.36, -.055, .94, .053), (.23, .035, 1.17, .045)]:
    uv('Toxic shoulder bubble', (x, y, z), (size, size, size), 'trait-acid', 10, 6)
    uv('Bubble glint', (x - size * .25, y - size * .83, z + size * .25),
       (size * .25, size * .10, size * .25), 'trait-acid-glint', 8, 6)
batched_export('trait-toxic', roughness=.28, emission=(.06, .18, .008))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'art', 'enemy-traits.blend'), compress=True)
print('GNOMEWARD_ENEMY_TRAITS_COMPLETE')
