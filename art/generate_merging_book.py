"""The hidden Book of Merging: original rounded Blender storybook prop.
Run: blender --background --python art/generate_merging_book.py
Writes public/assets/merging-book.glb, merging-book.png, art/merging-book.blend.
"""
from pathlib import Path
shared=Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0],str(Path(__file__).with_name('generate_assets.py')),'exec'))
mat('book-leather',(.18,.30,.20),rough=.91)
mat('book-spine',(.22,.13,.30),rough=.91)
mat('book-teal',(.10,.52,.49),rough=.88)
mat('book-purple',(.46,.25,.57),rough=.87)
mat('book-green',(.39,.60,.25),rough=.88)
mat('book-page',(.86,.75,.50),rough=.92)
mat('book-gold',(.88,.58,.19),metal=.18,rough=.6)
mat('book-thread',(.92,.80,.49),rough=.83)
mat('book-glimmer',(.56,.79,.53),rough=.65)
p=M['book-glimmer'].node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value=(.56,.79,.53,1);p.inputs['Emission Strength'].default_value=.32
reset()
# A slightly padded leather book, resting with the embroidered cover facing up.
cube('Soft leather lower cover',(0,0,.043),(1.00,1.22,.086),'book-leather',.06)
cube('Old cream page block',(.023,0,.155),(.89,1.105,.16),'book-page',.055)
for z in [.11,.145,.18,.213]:
    rod('Fine page edge',(.465,-.47,z),(.465,.47,z),.006,'book-thread')
    rod('Fine bottom page edge',(-.36,-.556,z),(.39,-.556,z),.005,'book-thread')
cube('Plush storybook cover',(0,0,.273),(1.015,1.24,.095),'book-leather',.068)
cube('Soft purple rounded spine',(-.455,0,.17),(.125,1.19,.30),'book-spine',.054)
for y in [-.40,-.20,.20,.40]:
    cube('Raised spine binding',(-.454,y,.176),(.142,.035,.30),'book-purple',.015)
# Top stitched border: a chain of soft golden thread dashes.
for x in [-.40,.40]:
    for i in range(12):
        y=-.50+i*.09;rod('Hand sewn cover edge',(x,y,.328),(x,y+.035,.328),.007,'book-thread')
for y in [-.515,.515]:
    for i in range(9):
        x=-.36+i*.083;rod('Hand sewn cover edge',(x,y,.328),(x+.035,y,.328),.007,'book-thread')
# Three overlapping hat patches meet at the center: leaf, teal, and plum.
def patch(cx,cy,color,angle,raise_by=0):
    poly=[(-.16,-.14),(.16,-.14),(.12,.015),(.045,.20),(-.035,.24),(-.105,.195),(-.095,.13),(-.037,.16),(-.025,.13),(-.10,.03)]
    def point(x,y,z=.338):return (cx+x*math.cos(angle)-y*math.sin(angle),cy+x*math.sin(angle)+y*math.cos(angle),z+raise_by)
    verts=[point(x,y,z) for z in [.330,.352] for x,y in poly];n=len(poly)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new('Little curved hat patch');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('Little curved hat patch',mesh);bpy.context.collection.objects.link(o);add(o,o.name,(0,0,0),(1,1,1),color)
    mod=o.modifiers.new('Soft embroidered edges','BEVEL');mod.width=.012;mod.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    rod('Cream hat cuff',point(-.13,-.10,.367),point(.13,-.10,.367),.011,'book-thread')
    uv('Little hat pompom',point(-.085,.15,.366),(.033,.033,.017),'book-glimmer',12,8)
    uv('Little gnome button nose',point(0,-.15,.370),(.045,.043,.022),'book-gold',12,8)
patch(-.17,.02,'book-green',-.28)
patch(.15,.015,'book-teal',.28,.025)
patch(.0,.205,'book-purple',0,.05)
# Intertwining golden loop joins all three embroidered hats.
for i in range(24):
    a=i*math.tau/24;b=(i+1)*math.tau/24
    rod('Joining embroidered loop',(.205*math.cos(a),-.27+.073*math.sin(a),.353),(.205*math.cos(b),-.27+.073*math.sin(b),.353),.010,'book-gold')
uv('Quiet joining gem',(0,-.27,.369),(.048,.048,.025),'book-glimmer',16,10)
# Rounded clasp and cloth bookmark give the prop a readable book silhouette.
cube('Leather clasp strap',(.432,.03,.33),(.22,.13,.046),'book-spine',.026)
cube('Old gold clasp',(.485,.03,.349),(.085,.112,.049),'book-gold',.025)
uv('Clasp button',(.485,.03,.377),(.020,.024,.009),'book-thread',12,8)
cube('Teal ribbon bookmark',(.18,-.614,.084),(.11,.29,.025),'book-teal',.012)
for y in [-.72,-.75]:rod('Bookmark gold tassel',(.145,y,.068),(.215,y,.068),.006,'book-gold')
book=export('merging-book')
book.hide_render=False;book.hide_set(False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=400;scene.render.resolution_y=400;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(Vector((0,0,.2))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(1.7,-2.3,3.8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,-.04,.17))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.85;scene.camera=cam
scene.render.filepath=os.path.join(OUT,'merging-book.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','merging-book.blend'),compress=True)
print('GNOMEWARD_MERGING_BOOK_COMPLETE')
