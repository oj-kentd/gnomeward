"""Blender-authored Gnomeward title illustrations, using only original game assets.
Run: blender --background --threads 6 --python art/generate_splash.py
Optional -- --draft renders at half resolution for composition review.
Writes gnomeward-splash-wood.webp at 1920x1080 and
gnomeward-splash-wood-mobile.webp at 960x1200, plus art/splash.blend.
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
mat('Timber dark sidewalls',(.040,.012,.004),.88)
mat('Timber cut edge',(.090,.031,.009),.80)
mat('Timber knot rings',(.040,.009,.002),.86)
mat('Timber wooden pegs',(.13,.043,.011),.82)

# Broad, directional walnut grain remains legible when the mobile image shrinks.
# Generated coordinates follow each individual letter's hand-cut orientation.
for index, warmth in enumerate([.90, 1.04, .98]):
    wood=mat('Walnut face '+str(index),(.19*warmth,.071*warmth,.017*warmth),.78)
    nodes=wood.node_tree.nodes;links=wood.node_tree.links
    shader=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexCoord')
    stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(1.4,9.0,1.0)
    links.new(tex.outputs['Generated'],stretch.inputs[0])
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.3;noise.inputs['Detail'].default_value=2.0;noise.inputs['Roughness'].default_value=.70
    links.new(stretch.outputs[0],noise.inputs['Vector'])
    bands=nodes.new('ShaderNodeTexWave');bands.wave_type='BANDS';bands.bands_direction='Y';bands.inputs['Scale'].default_value=3.5;bands.inputs['Distortion'].default_value=5.0;bands.inputs['Detail'].default_value=2.0;bands.inputs['Detail Scale'].default_value=.85
    links.new(tex.outputs['Generated'],bands.inputs['Vector'])
    mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.45
    links.new(noise.outputs['Fac'],mix.inputs[1]);links.new(bands.outputs['Color'],mix.inputs[2])
    ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.15;ramp.color_ramp.elements[0].color=(.052*warmth,.012*warmth,.003*warmth,1)
    ramp.color_ramp.elements[1].position=.70;ramp.color_ramp.elements[1].color=(.30*warmth,.135*warmth,.032*warmth,1)
    middle=ramp.color_ramp.elements.new(.42);middle.color=(.17*warmth,.057*warmth,.011*warmth,1)
    links.new(mix.outputs[0],ramp.inputs[0]);links.new(ramp.outputs['Color'],shader.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.012
    links.new(mix.outputs[0],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
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
    root=bpy.data.objects.new('GNOMEWARD handmade walnut lettering',None)
    scene.collection.objects.link(root);root.location=screen(0,sy,5.2)
    root.rotation_euler=cam.rotation_euler;composition.append(root)
    letters=[];cursor=0
    angles=[-.026,.018,-.020,.025,-.012,.017,-.025,.020,-.018]
    rises=[.014,-.009,.013,-.016,.008,-.010,.012,-.004,.007]
    for index,character in enumerate('GNOMEWARD'):
        curve=bpy.data.curves.new('Cut walnut '+character,'FONT')
        curve.body=character;curve.font=font;curve.align_x='CENTER';curve.align_y='CENTER'
        curve.size=1;curve.offset=0;curve.extrude=.125
        curve.bevel_depth=.008;curve.bevel_resolution=3;curve.resolution_u=12
        obj=bpy.data.objects.new('Wooden letter '+str(index+1)+' '+character,curve)
        scene.collection.objects.link(obj)
        # Convert each zero-offset glyph into a genuine beveled timber mesh.
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
        obj=bpy.context.object;obj.data.materials.clear()
        for material in [materials['Walnut face '+str(index%3)],materials['Timber dark sidewalls'],materials['Timber cut edge']]:obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.material_index=0 if polygon.normal.z>.92 else 2 if polygon.normal.z>.15 else 1
        bpy.context.view_layer.update()
        glyph_width=obj.dimensions.x
        holder=bpy.data.objects.new('Hand-placed '+character+' '+str(index),None);scene.collection.objects.link(holder)
        holder.parent=root;holder.location=(cursor+glyph_width/2,rises[index],.08)
        holder.rotation_euler=(.012 if index%2 else -.012,(-.045 if index%2 else .045),angles[index])
        obj.parent=holder;obj.location=(0,0,0)
        cursor+=glyph_width+.045
        letters.append(holder)
        # Small wooden pegs and knots sit only on solid letter strokes, verified
        # by local mesh ray casts so holes in O, A, R and D remain open.
        xs=[-glyph_width*.31,glyph_width*.31,0,-glyph_width*.17,glyph_width*.17]
        ys=[.16,-.16,.04,-.04,.24,-.24]
        def solid(x,y):
            hit,point,normal,_=obj.ray_cast(Vector((x,y,.6)),Vector((0,0,-1)))
            return hit and normal.z>.8
        anchors=[]
        for y in ys:
            for x in xs:
                if all(solid(x+dx,y+dy) for dx,dy in [(0,0),(.024,0),(-.024,0),(0,.024),(0,-.024)]):
                    if all(math.hypot(x-a,y-b)>.21 for a,b in anchors):anchors.append((x,y))
        for x,y in anchors[:2]:
            peg=sphere('Round wooden joinery peg',(0,0,0),(.019,.019,.007),materials['Timber wooden pegs'],12,8)
            peg.parent=holder;peg.location=(x,y,.139)
        if index in [0,2,4,7] and anchors:
            x,y=anchors[-1]
            for ring in range(3):
                radius=.023+ring*.008
                if not all(solid(x+math.cos(a)*radius,y+math.sin(a)*radius*.52) for a in [i*math.tau/12 for i in range(12)]):continue
                curve=bpy.data.curves.new('Walnut knot growth ring','CURVE');curve.dimensions='3D';curve.bevel_depth=.0017;curve.bevel_resolution=2
                spline=curve.splines.new('POLY');spline.points.add(23)
                for i,point in enumerate(spline.points):
                    a=i*math.tau/24;point.co=(x+math.cos(a)*radius,y+math.sin(a)*radius*.52,.135,1)
                spline.use_cyclic_u=True
                knot=bpy.data.objects.new('Dark knot ring in '+character,curve);scene.collection.objects.link(knot);knot.parent=holder;curve.materials.append(materials['Timber knot rings'])
    total=cursor-.045
    for holder in letters:holder.location.x-=total/2
    factor=width/(total+.03)
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
        defenders=[('gnome-gravity',-1.05,-2.70,1.75,.20),('gnome-sprout',-2.65,-2.15,1.35,.47),('gnome-spore',-3.15,-.15,1.55,.48),('gnome-strawberry',-1.45,.75,1.4,.47),('gnome-boom',-3.35,-2.45,1.20,.43)]
        enemies=[('skeleton',1.3,-1.9,1.25,-.6,None),('skeleton',3,-2.4,1.2,-.55,(.93,.37,.12)),('skeleton',2.95,-.25,1.18,-.5,(.43,.77,.90)),('skeleton-boss',2.55,1.05,1.16,-.45,(.52,.22,.72))]
    else:
        defenders=[('gnome-gravity',-2.80,-2.25,1.90,.20),('gnome-sprout',-4.55,-2.95,1.60,.55),('gnome-spore',-5.35,-.85,1.7,.50),('gnome-strawberry',-2.0,-.15,1.58,.6),('gnome-boom',-6.25,-2.95,1.30,.5)]
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
scene.render.filepath=str(OUT/'gnomeward-splash-wood.webp');bpy.ops.render.render(write_still=True)
# Save editable landscape with all title fonts packed and GLB geometry embedded.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/splash.blend'),compress=True)
build(True)
scene.render.filepath=str(OUT/'gnomeward-splash-wood-mobile.webp');bpy.ops.render.render(write_still=True)
print('GNOMEWARD_SPLASH_COMPLETE')
