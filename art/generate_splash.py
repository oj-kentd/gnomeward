"""Blender-authored Gnomeward title illustrations, using only original game assets.
Run: blender --background --threads 6 --python art/generate_splash.py
Optional -- --draft renders at half resolution for composition review.
Writes desktop 1920x1080 and portrait 960x1200 WebPs, plus art/splash.blend.
The saved scene is the landscape composition. Both compositions are reproducible.
"""
import bpy, math, os, random, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'public/assets'
random.seed(102)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.39,.55,.38,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
scene.render.image_settings.file_format='WEBP';scene.render.image_settings.quality=92
scene.render.resolution_percentage=50 if '--draft' in sys.argv else 100
bpy.context.preferences.filepaths.save_version=0

materials={}
def mat(name,color,rough=.8):
    material=bpy.data.materials.new(name);material.diffuse_color=(*color,1);material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Roughness'].default_value=rough
    materials[name]=material;return material
mat('Garden grass',(.26,.46,.13));mat('Soft moss highlight',(.37,.56,.20));mat('Forest background',(.09,.22,.11))
mat('Logo deep green',(.035,.13,.055));mat('Logo golden edge',(.93,.52,.075));mat('Logo warm cream',(1,.89,.55))
mat('Sunlit golden pollen',(1,.71,.20));mat('Magic mushroom green',(.48,.80,.17))

def screen(x,y,z=0):return Vector((x,(y-.8*z)/.6,z))
def sphere(name,location,scale,material,segments=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=location)
    obj=bpy.context.object;obj.name=name;obj.scale=scale;obj.data.materials.append(material)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    return obj

cache={};composition=[]
def asset(name,x,y,scale=1,rotation=0,z=0,tint=None):
    if name not in cache:
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(OUT/(name+'.glb')))
        imported=[obj for obj in bpy.data.objects if obj not in before]
        cache[name]=[(obj,obj.matrix_world.copy()) for obj in imported if obj.type=='MESH']
        for obj in imported:obj.hide_render=True;obj.hide_set(True)
    root=bpy.data.objects.new('Scene '+name,None);scene.collection.objects.link(root)
    for original,matrix in cache[name]:
        obj=original.copy();obj.data=original.data;scene.collection.objects.link(obj)
        obj.hide_render=False;obj.hide_set(False);obj.parent=root;obj.matrix_local=matrix
        if tint:
            obj.data=obj.data.copy()
            for i,material in enumerate(obj.data.materials):
                if any(word in material.name.lower() for word in ('cream','purple','bone')):
                    copy=material.copy();copy.diffuse_color=(*tint,1);copy.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*tint,1);obj.data.materials[i]=copy
    root.location=screen(x,y,z);root.scale=(scale,)*3;root.rotation_euler.z=rotation
    composition.append(root);return root

def remove_composition():
    for obj in list(composition):
        for child in list(obj.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
        bpy.data.objects.remove(obj,do_unlink=True)
    composition.clear()

bpy.ops.object.camera_add(location=(0,-20,15))
cam=bpy.context.object;cam.name='Title scene camera';cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';scene.camera=cam
for name,location,power,size,color in [('Warm morning softbox',(-7,-9,13),2200,8,(1,.87,.65)),('Garden fill',(8,-4,10),1500,7,(.77,.87,1)),('Golden canopy rim',(1,8,12),2600,6,(1,.93,.67))]:
    bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.data.color=color;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
# A continuous, softly lit garden backdrop avoids a hard studio horizon.
sphere('Rounded garden island',(0,1,-.70),(14,15,.82),materials['Garden grass'],64,32)
sphere('Deep green distant backdrop',(0,0,-2),(70,70,1),materials['Forest background'],32,16)

font=bpy.data.fonts.load(os.environ.get('GNOMEWARD_TITLE_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
def logo(width,sy):
    root=bpy.data.objects.new('GNOMEWARD layered title',None);scene.collection.objects.link(root);root.location=screen(0,sy,5.2);root.rotation_euler=cam.rotation_euler;composition.append(root)
    for name,offset,extrude,bevel,depth,material in [('Dark green outline',.074,.19,.033,-.11,'Logo deep green'),('Golden title bevel',.033,.135,.026,.07,'Logo golden edge'),('Cream letter faces',0,.067,.023,.225,'Logo warm cream')]:
        curve=bpy.data.curves.new(name,'FONT');curve.body='GNOMEWARD';curve.font=font;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=1;curve.space_character=1.04;curve.offset=offset;curve.extrude=extrude;curve.bevel_depth=bevel;curve.bevel_resolution=4;curve.resolution_u=12
        obj=bpy.data.objects.new(name,curve);scene.collection.objects.link(obj);obj.parent=root;obj.location.z=depth;curve.materials.append(materials[material])
    bpy.context.view_layer.update()
    face=root.children[-1];factor=width/face.dimensions.x
    root.scale=(factor,)*3


def build(portrait=False):
    remove_composition();random.seed(102)
    cam.data.ortho_scale=12.5 if portrait else 18
    scene.render.resolution_x=960 if portrait else 1920
    scene.render.resolution_y=1200 if portrait else 1080
    logo(8.5 if portrait else 15.0,4.55 if portrait else 3.2)
    # Rounded foliage frames the illustration; the title remains visually clear.
    backdrop=[(-7.7,1.1,1.75),(-6.2,1.55,1.30),(7.8,1.0,1.8),(6.4,1.45,1.4),(-8,-3.6,1.45),(8.1,-3.5,1.45)] if not portrait else [(-4.7,1.5,1.4),(4.7,1.3,1.5),(-4.6,-2.7,1.2),(4.6,-2.7,1.3)]
    for x,y,size in backdrop:asset('tree',x,y,size,rotation=random.uniform(-.5,.5))
    # Warm stepping stones lead the skeletons into the garden battle.
    stones=[(6.8,.7),(6.3,.2),(5.8,-.3),(5.25,-.8),(4.65,-1.3),(4,-1.8),(3.25,-2.2),(2.45,-2.5),(1.65,-2.85)] if not portrait else [(3.7,2),(3.2,1.45),(2.8,.9),(2.4,.35),(2,-.2),(1.6,-.75),(1.1,-1.3),(.55,-1.85)]
    for x,y in stones:asset('path-tile',x,y,1.25,rotation=.5,z=.04)
    flowers=[(-6.7,-3.65),(-4.7,-3.8),(-3.3,-3.4),(6.7,-3.6),(4.8,-3.7),(2.9,-3.6),(-6.3,.35),(5.7,.75)] if not portrait else [(-3.8,-3.25),(-2.7,-3.3),(3.5,-3.2),(2.4,-3.25),(-3.8,2),(3.9,2)]
    for i,(x,y) in enumerate(flowers):
        asset('strawberry-bush' if i%3==0 else 'flower',x,y,.9 if i%3==0 else 1.5,rotation=i)
    if portrait:
        defenders=[('gnome-sprout',-2.25,-2.0,1.7,.47),('gnome-spore',-3.15,-.15,1.55,.48),('gnome-strawberry',-1.45,.75,1.4,.47),('gnome-boom',-3.35,-2.45,1.20,.43)]
        enemies=[('skeleton',1.3,-1.9,1.25,-.6,None),('skeleton',3,-2.4,1.2,-.55,(.93,.37,.12)),('skeleton',2.95,-.25,1.18,-.5,(.43,.77,.90)),('skeleton-boss',2.55,1.05,1.16,-.45,(.52,.22,.72))]
    else:
        defenders=[('gnome-sprout',-3.9,-2.65,1.9,.55),('gnome-spore',-5.35,-.85,1.7,.50),('gnome-strawberry',-2.3,-.65,1.58,.6),('gnome-boom',-6.25,-2.95,1.30,.5)]
        enemies=[('skeleton',2.7,-2.55,1.6,-.6,None),('skeleton',4.45,-3.2,1.35,-.55,(.93,.37,.12)),('skeleton',5.9,-1.65,1.35,-.5,(.43,.77,.90)),('skeleton-boss',4.5,-.45,1.35,-.5,(.52,.22,.72))]
    for name,x,y,size,angle in defenders:asset(name,x,y,size,rotation=angle)
    for name,x,y,size,angle,tint in enemies:
        enemy=asset(name,x,y,size,rotation=angle,tint=tint)
        enemy.rotation_euler.y=-.055
    # A big airborne berry and separate BLACK seed rays communicate the mortar.
    berry=asset('strawberry-fruit',.1 if portrait else .45,1.35 if portrait else .65,.50,rotation=-.6,z=2.4)
    berry.rotation_euler.y=.38
    for i in range(7):
        angle=i*math.tau/7
        x=(.55 if portrait else 1.4)+math.cos(angle)*(.68 if portrait else .90)
        y=(-.25 if portrait else -1.15)+math.sin(angle)*(.56 if portrait else .72)
        seed=asset('strawberry-seed',x,y,.11,rotation=angle,z=.45)
        seed.rotation_euler.y=math.pi/2;seed.rotation_euler.z=angle
    for x,y,size in ([(-.8,-1.25,.85),(-.15,-1.65,.6)] if portrait else [(-.65,-1.9,.85),(.20,-2.2,.65)]):asset('mushroom',x,y,size,z=.05)
    # Slingshot pebbles and a few pollen motes add movement without laser beams.
    for x,y,z,size in ([(-.9,-.2,1.1,.095),(-.3,.1,1.4,.065)] if portrait else [(-1.3,-.7,1.1,.10),(-.45,-.35,1.35,.075)]):asset('projectile',x,y,size,z=z)
    # Subtle foreground plant framing keeps the center-bottom free for UI buttons.
    for x in ([-4.6,4.6] if portrait else [-8.2,-7.0,7.0,8.2]):asset('bush',x,-4.65 if portrait else -4.1,1.4,rotation=x)
    for x,y in ([(-4.15,3.35),(4.15,3.35)] if portrait else [(-7.9,2.45),(7.9,2.45)]):asset('flower',x,y,1.25,z=2.1)
    bpy.context.view_layer.update()

build(False)
scene.render.filepath=str(OUT/'gnomeward-splash.webp');bpy.ops.render.render(write_still=True)
# Save editable landscape with all title fonts packed and GLB geometry embedded.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/splash.blend'),compress=True)
build(True)
scene.render.filepath=str(OUT/'gnomeward-splash-mobile.webp');bpy.ops.render.render(write_still=True)
print('GNOMEWARD_SPLASH_COMPLETE')
