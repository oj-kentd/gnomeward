"""Skip and the Tumble/Morrow/Skip fusion, authored entirely in Blender.
Run: blender --background --threads 6 --python art/generate_ricochet.py
Exports grounded gnomes, transparent portraits, and a centered unit-radius ball.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_fusions.py').read_text()
exec(compile(shared.split('\nassets={}')[0], str(Path(__file__).with_name('generate_fusions.py')), 'exec'))
mat('skip-orange', (.98,.285,.035), rough=.88)
mat('skip-blue', (.025,.28,.95), rough=.4)
mat('skip-light', (.18,.70,1), rough=.36)
p=M['skip-light'].node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value=(.08,.36,1,1)
p.inputs['Emission Strength'].default_value=.25

def ball(loc, radius):
    uv('Blue bouncing ball',loc,(radius,)*3,'skip-blue',24,16)
    for angle in [0,math.pi/2]:
        ring=torus('Cyan ball seam',loc,radius*.985,radius*.025,'skip-light')
        ring.rotation_euler.x=angle

def launcher(x, fusion=False):
    cube('Orange ball launcher',(x,-.25,.61),(.22,.33,.22),'skip-orange',.045)
    rod('Blue padded hand grip',(x,-.16,.43),(x,-.16,.62),.043,'skip-blue')
    ring=torus('Round blue launcher mouth',(x,-.425,.61),.11,.027,'skip-blue')
    ring.rotation_euler.x=math.pi/2
    uv('Launcher dark interior',(x,-.426,.61),(.082,.012,.082),'ink',16,10)
    ball((x,-.45,.61),.067)
    if fusion:
        for dx in [-.065,.065]:
            ring=torus('Tumble twin muzzle',(x+dx,-.42,.74),.041,.012,'fusion-teal')
            ring.rotation_euler.x=math.pi/2
        uv('Morrow soul engine',(x,-.22,.77),(.065,.067,.075),'fusion-mint',16,10)

assets={}
reset();gnome('ricochet','skip-orange')
for obj in parts:
    if obj.name.startswith(('Plaid coat','Red pompom','Pompom fluff')):recolor(obj,'skip-blue')
    elif obj.name.startswith('Woven plaid stripe'):recolor(obj,'skip-orange')
torus('Blue knitted hat cuff',(0,0,.842),.361,.023,'skip-blue')
# Three small ball emblems and a curved stitched bounce trail on the orange hat.
for x,z,r in [(-.16,1.01,.033),(0,1.14,.042),(.16,1.04,.033)]:
    uv('Blue embroidered ball',(x,-.285 if z<1.1 else -.25,z),(r,.014,r),'skip-blue',12,8)
launcher(.40)
ball((-.40,-.17,.62),.14)
assets['ricochet']=grounded_export('gnome-ricochet')

reset();body('multi-necro-ricochet',['skip-orange','skip-blue','fusion-plum'])
for x in [-.40,.40]:launcher(x,True)
# A crown of three blue soul balls makes the three-way form readable at game scale.
for x,z in [(-.23,1.43),(0,1.57),(.23,1.43)]:
    rod('Soul ball crown support',(x*.65,.12,1.20),(x,.12,z),.024,'fusion-plum')
    ball((x,.12,z),.09)
    ring=torus('Mint soul ball halo',(x,.12,z),.12,.012,'fusion-mint')
    ring.rotation_euler.x=.6
assets['fusion-multi-necro-ricochet']=grounded_export('gnome-fusion-multi-necro-ricochet')
reset();ball((0,0,0),1);projectile=export('ricochet-ball')

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,-.03,.82))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.15;scene.camera=cam
for key,obj in assets.items():
    obj.hide_render=False;obj.hide_set(False);scene.render.filepath=os.path.join(OUT,key+'.png');bpy.ops.render.render(write_still=True);obj.hide_render=True;obj.hide_set(True)
for x,obj in zip([-.85,.85],assets.values()):obj.location.x=x;obj.hide_render=False;obj.hide_set(False)
projectile.hide_render=False;projectile.hide_set(False);projectile.location=(0,-.35,.2);projectile.scale*=.15
cam.location=(.8,-7,3.6);cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.7
scene.render.resolution_x=1100;scene.render.resolution_y=650
scene.render.filepath=os.path.join(ROOT,'art','ricochet-preview.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','ricochet.blend'),compress=True)
print('GNOMEWARD_RICOCHET_COMPLETE')
