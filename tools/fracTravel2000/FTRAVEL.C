/*  GNU GPL Fractal Traveller v1.00 - source code
    Copyright (C) 2000 Jindrich Novy (newman@email.cz)

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program; if not, write to the Free Software
    Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.

    For compilation this source code use GNU C/C++ (DJGPP v2.02+) with
    installed graphics library Allegro v3.12+. All mentioned is FREE
    to download from http://www.delorie.com.

    Greets goes to:
     - DJ Delorie
     - Shawn Hargreaves
     - Gaston Julia :)
     - Benoit Mandelbrot :))
*/

#include <allegro.h>
#include <bios.h>

#define Xres 1024
#define Yres 768

#define Xmax Xres
#define Ymax Yres

#define ipp 0xFF
#define orbit_iter_limit 0xFFF

#define probe_size 0x180

double zoom = 1.02;
double xs = -2, xe = 2;
double ys = -2, ye = 2;
double xu, yu;
double oxs, oys, oxe, oye, oxu, oyu, ozoom;
double cx, cy;
int frag_size, step, over,
    orbit_pixel = 1,
    probe_activated = 0,
    orbit_view = 0,
    pal_gradient = 0;
volatile int tact = 0, timer_enabled;
volatile int mouse_event = 0,
             mouse_l = 0,
             mouse_r = 0,
             mouse_m = 0,
             mouse_move = 0;
PALETTE pal;
BITMAP *bmp;

int (*iter_function)(double, double);

#define Re_Z1 X
#define Im_Z1 Y

#define Re_Z2 X*X-Y*Y
#define Im_Z2 2*oX*Y

#define Re_Z3 X*X*X-3*X*Y*Y
#define Im_Z3 3*oX*oX*Y-Y*Y*Y

#define Re_Z4 X*X*X*X-6*X*X*Y*Y+Y*Y*Y*Y
#define Im_Z4 4*(oX*oX*oX*Y-oX*Y*Y*Y)

#define Re_Z Re_Z2
#define Im_Z Im_Z2

int mandel_iterator( double x, double y )
{
  double X = x, Y = y, oX;
  int	 i = 0;

  while ( X*X+Y*Y <= 4 && ++i < ipp )
  {
    oX	= X;
    X   = Re_Z+x;
    Y   = Im_Z+y;
  }

  return( i );
}

int julia_iterator( double x, double y )
{
  double X = x, Y = y, oX;
  int	 i = 0;

  while ( X*X+Y*Y <= 4 && ++i < ipp )
  {
    oX = X;
    X  = Re_Z+cx;
    Y  = Im_Z+cy;
  }

  return( i );
}

void orbit_iterator( int xxs, int yys, int xxe, int yye )
{
  double X = cx, Y = cy, oX, sX, sY;
  int	 i = 0, itr = 0, col;

  rectfill( screen, xxs, yys, xxe, yye, 0 );

  while ( X*X+Y*Y <= 4 && ++itr < orbit_iter_limit )
  {
    oX = X;
    X  = Re_Z+cx;
    Y  = Im_Z+cy;
  }

  X = cx;
  Y = cy;
  sX = X;
  sY = Y;
  while ( X*X+Y*Y <= 4 && ++i < orbit_iter_limit )
  {
    if ( pal_gradient )
      col = (i<<8)/itr;
    else
      col = 0xFF;
    if ( orbit_pixel )
      putpixel( screen, xxs+(X-xs)/xu, yys+(Y-ys)/yu, col );
    else
      line( screen, xxs+(sX-xs)/xu, yys+(sY-ys)/yu, xxs+(X-xs)/xu, yys+(Y-ys)/yu, col );

    sX = X;
    sY = Y;

    oX = X;
    X  = Re_Z+cx;
    Y  = Im_Z+cy;
  }
  textprintf( screen, font, 1, yye-8, 0xE0,  "I: 0x%03X  ", i );
}

void recursor( int x, int y, int l )
{
  double X = x, Y = y;

  if ( l == frag_size )
  {
    if ( over || x&((l<<1)-1) || y&((l<<1)-1) )
      rectfill( screen, x, y, x+l-1, y+l-1,
//      putpixel( screen, x, y,
//                0xFF );
                iter_function( xs+X*xu, ys+Y*yu ) );
    return;
  }

  if ( tact ) return;
  l >>= 1;
  recursor( x,   y,   l );
  recursor( x+l, y,   l );
  recursor( x+l, y+l, l );
  recursor( x  , y+l, l );
}

void view( int xxs, int yys, int xxe, int yye )
{
  int x, y;

  over = 1;
  step = 0x10;

  for ( frag_size=step; frag_size>=1; frag_size>>=1, over=0 )
    for ( y=yys; y<yye; y+=step )
      for ( x=xxs; x<xxe; x+=step )
        recursor( x, y, step );
}

void timer_handler()
{
  if ( timer_enabled ) tact++;
}
END_OF_FUNCTION(timer_handler);

void mouse_handler( int flags )
{
  if ( !(flags & MOUSE_FLAG_MOVE) )
  {
    if ( flags & MOUSE_FLAG_LEFT_DOWN )
      { mouse_event = 1; mouse_l = 1; }
    if ( flags & MOUSE_FLAG_RIGHT_DOWN )
      { mouse_event = 1; mouse_r = 1; }
    if ( flags & MOUSE_FLAG_MIDDLE_DOWN )
      { mouse_event = 1; mouse_m = 1; }
  } else
    mouse_move = 1;
}
END_OF_FUNCTION(mouse_handler);

void set_default_pal()
{
  int i;
///*
  #define SetPalColor(x,e,f,y) { pal[x].r=e;pal[x].g=f;pal[x].b=y; }
  for ( i=0; i<0x40; i++ )
    SetPalColor( i, i, 0, 0 );
  for ( i=0x40; i<0x80; i++ )
    SetPalColor( i, 0x3F, i-0x40, 0 );
  for ( i=0x80; i<0xC0; i++ )
    SetPalColor( i, 0x3F, 0x3F, i-0xC0 );
  for ( i=0xC0; i<0x100; i++ )
    SetPalColor( i, 0x3F, 0x3F, 0x3F );
//*/
/*
  for ( i=0; i<0x100; i++ )
  {
    pal[i].r = (i>>3)&0x3F;
    pal[i].g = (i>>2)&0x3F;
    pal[i].b = (i>>1)&0x3F;
  }
*/
/*
  for ( i=0; i<0x100; i++ )
  {
    pal[i].r = i>>2;
    pal[i].g = i>>2;
    pal[i].b = i>>2;
  }
*/
  set_palette( pal );
}

void rot_forward_pal()
{
  int pr = pal[0xFF].r,
      pg = pal[0xFF].g,
      pb = pal[0xFF].b, i, t = timer_enabled;

  tact = 0;
  timer_enabled = 1;
  while ( !mouse_event && !bioskey(1) )
  {
    while ( !tact && !mouse_event && !bioskey(1) );
    tact = 0;

    for ( i=0xFF; i>0; i-- )
    {
      pal[i].r = pal[i-1].r;
      pal[i].g = pal[i-1].g;
      pal[i].b = pal[i-1].b;
    }
    pal[0].r = pr;
    pal[0].g = pg;
    pal[0].b = pb;

    pr = pal[0xFF].r;
    pg = pal[0xFF].g;
    pb = pal[0xFF].b;

    set_palette( pal );
  }
  timer_enabled = t;
//  set_default_pal();
}

void rot_backward_pal()
{
  int pr = pal[0].r,
      pg = pal[0].g,
      pb = pal[0].b, i, t = timer_enabled;

  tact = 0;
  timer_enabled = 1;
  while ( !mouse_event && !bioskey(1) )
  {
    while ( !tact && !mouse_event && !bioskey(1) );
    tact = 0;

    for ( i=0; i<0xFF; i++ )
    {
      pal[i].r = pal[i+1].r;
      pal[i].g = pal[i+1].g;
      pal[i].b = pal[i+1].b;
    }
    pal[0xFF].r = pr;
    pal[0xFF].g = pg;
    pal[0xFF].b = pb;
    set_palette( pal );

  }
  timer_enabled = t;
//  set_default_pal();
}

void help()
{
  int t = timer_enabled , ta = tact;

  textprintf( screen, font, 1, 0, 0xE0, "GNU GPL Fractal Traveller  v1.00" );
  textprintf( screen, font, 1, 8, 0xE0, "Copyright (C) 2000 Jindrich Novy" );
  if ( iter_function == mandel_iterator )
  {
    if ( timer_enabled )
    {
      textprintf( screen, font, 1, 0x18, 0xE0, "Mode: Mandelbrot browser" );
      textprintf( screen, font, 1, 0x28, 0xE0, "mouse controls:" );
      textprintf( screen, font, 1, 0x30, 0xE0, "move          set position in Mandelbrot set" );
      textprintf( screen, font, 1, 0x38, 0xE0, "left button   snapshot mode" );
      textprintf( screen, font, 1, 0x40, 0xE0, "right button  quit immediatelly" );
      textprintf( screen, font, 1, 0x50, 0xE0, "keyboard controls:" );
      textprintf( screen, font, 1, 0x58, 0xE0, "Space  snapshot mode" );
      textprintf( screen, font, 1, 0x60, 0xE0, "PgUp   zoom++" );
      textprintf( screen, font, 1, 0x68, 0xE0, "PgDn   zoom--" );
      textprintf( screen, font, 1, 0x70, 0xE0, "Esc    quit immediatelly" );
    } else
    {
      textprintf( screen, font, 1, 0x18, 0xE0, "Mode: Snapshot" );
      textprintf( screen, font, 1, 0x28, 0xE0, "mouse controls:" );
      textprintf( screen, font, 1, 0x30, 0xE0, "left button   enter Julia mode" );
      textprintf( screen, font, 1, 0x38, 0xE0, "right button  back to Mandelbrot browser" );
      textprintf( screen, font, 1, 0x48, 0xE0, "keyboard controls:" );
      textprintf( screen, font, 1, 0x50, 0xE0, "s    save screen to SNAPSHOT.PCX" );
      textprintf( screen, font, 1, 0x58, 0xE0, "+    rotate palette forwards" );
      textprintf( screen, font, 1, 0x60, 0xE0, "-    rotate palette backwards" );
      textprintf( screen, font, 1, 0x68, 0xE0, "d    restore default palette" );
      textprintf( screen, font, 1, 0x70, 0xE0, "Esc  back to Mandelbrot browser" );
    }
  } else
  {
    if ( probe_activated )
    {
      textprintf( screen, font, 1, 0x18, 0xE0, "Mode: Julia/Orbit probe" );
      textprintf( screen, font, 1, 0x28, 0xE0, "mouse controls:" );
      textprintf( screen, font, 1, 0x30, 0xE0, "move          set C for Julia" );
      textprintf( screen, font, 1, 0x38, 0xE0, "left button   Julia browser mode" );
      textprintf( screen, font, 1, 0x40, 0xE0, "right button  back to snap. mode" );
      textprintf( screen, font, 1, 0x50, 0xE0, "keyboard controls:" );
      textprintf( screen, font, 1, 0x58, 0xE0, "o   de/activate orbit probe" );
      textprintf( screen, font, 1, 0x60, 0xE0, "l   de/activate line traces" );
      textprintf( screen, font, 1, 0x68, 0xE0, "p   de/activate iter. gradient" );
    } else
    {
      if ( timer_enabled )
      {
        textprintf( screen, font, 1, 0x18, 0xE0, "Mode: Julia browser" );
        textprintf( screen, font, 1, 0x28, 0xE0, "mouse controls:" );
        textprintf( screen, font, 1, 0x30, 0xE0, "move          set position in Julia" );
        textprintf( screen, font, 1, 0x38, 0xE0, "left button   snapshot mode" );
        textprintf( screen, font, 1, 0x40, 0xE0, "right button  back to Julia/Orbit probe mode" );
        textprintf( screen, font, 1, 0x50, 0xE0, "keyboard controls:" );
        textprintf( screen, font, 1, 0x58, 0xE0, "Space  snapshot mode" );
        textprintf( screen, font, 1, 0x60, 0xE0, "PgUp   zoom++" );
        textprintf( screen, font, 1, 0x68, 0xE0, "PgDn   zoom--" );
        textprintf( screen, font, 1, 0x70, 0xE0, "Esc    back to Julia/Orbit probe mode" );
      } else
      {
        textprintf( screen, font, 1, 0x18, 0xE0, "Mode: Snapshot" );
        textprintf( screen, font, 1, 0x28, 0xE0, "mouse controls:" );
        textprintf( screen, font, 1, 0x30, 0xE0, "left button   back to Julia/Orbit probe mode" );
        textprintf( screen, font, 1, 0x38, 0xE0, "right button  back to Julia browser" );
        textprintf( screen, font, 1, 0x48, 0xE0, "keyboard controls:" );
        textprintf( screen, font, 1, 0x50, 0xE0, "s    save screen to SNAPSHOT.PCX" );
        textprintf( screen, font, 1, 0x58, 0xE0, "+    rotate palette forwards" );
        textprintf( screen, font, 1, 0x60, 0xE0, "-    rotate palette backwards" );
        textprintf( screen, font, 1, 0x68, 0xE0, "d    restore default palette" );
        textprintf( screen, font, 1, 0x70, 0xE0, "Esc  back to Julia browser" );
      }
    }
  }

  mouse_event = mouse_l = mouse_r = mouse_m = 0;
  while ( bioskey(1) ) bioskey(0);

  while ( !mouse_event && !bioskey(1) );

  if ( bioskey(1) ) bioskey(0);
  mouse_event = mouse_l = mouse_r = mouse_m = 0;

  timer_enabled = t;
  tact = ta;
}

void fly()
{
  double xc, yc, xr, yr;
  int dx, dy, c = 0, key = 0;

  for (;;)
  {
    xu = (xe-xs)/Xmax;
    yu = (ye-ys)/Ymax;

    if ( xu > yu )
    {
      yu = xu;
      ye = yu*Ymax+ys;
    }
    else
    {
      xu = yu;
      xe = xu*Xmax+xs;
    }

    dx = Xmax>>1;
    dy = Ymax>>1;
    position_mouse( dx, dy );

    view( 0, 0, Xmax, Ymax-16 );
    textprintf( screen, font, 1, Yres-16, 0xE0, "Re(Z): <%+.18f, %+.18f) ", xs, xe );
    textprintf( screen, font, 1, Yres-8, 0xE0,  "Im(Z): <%+.18f, %+.18f) ", ys, ye );
    while ( !tact );
    tact = 0;

    if ( bioskey(1) || mouse_event )
    {
      if ( !mouse_event )
        key = bioskey(0);
      else
      {
        if ( mouse_l ) { key = 0x3920; mouse_l = 0; }
          else
        if ( mouse_r )
        {
          mouse_r = 0;
          if ( iter_function == mandel_iterator )
            key = 0x11B;
          else
          {
            mouse_l = 1;
            timer_enabled = tact = 0;
            goto wait;
          }
        }
        mouse_event = 0;
      }

      switch( key )
      {
        case 0x3b00:
          help();
          break;
        case 0x3920:
          do {
            timer_enabled = tact = 0;
            view( 0, 0, Xmax, Ymax );
wait:
            while ( !mouse_l && !mouse_r && !bioskey(1) );

            if ( mouse_r )
            {
              mouse_r = 0;
              break;
            } else
            {
              if ( mouse_l && iter_function == julia_iterator )
              {
                iter_function = mandel_iterator;

                zoom = ozoom;
                xs = oxs;
                ys = oys;
                xe = oxe;
                ye = oye;
                xu = oxu;
                yu = oyu;

                view( 0, 0, Xmax, Ymax );
              }
              if ( mouse_l )
              {
                probe_activated = 1;
                mouse_l = 0;
                ozoom = zoom;
                oxs = xs;
                oys = ys;
                oxe = xe;
                oye = ye;
                oxu = xu;
                oyu = yu;

                xs = -2; xe = 2;
                ys = -2; ye = 2;
                zoom = 1.02;
                xu = (xe-xs)/probe_size;
                yu = (ye-ys)/probe_size;

                iter_function = julia_iterator;

                position_mouse( Xmax>>1, Ymax>>1 );
                mouse_r = mouse_event = 0;
                show_mouse( screen );
                do {
                  cx = oxs+(double)mouse_x*oxu;
                  cy = oys+(double)mouse_y*oyu;
                  if ( orbit_view )
                    orbit_iterator( 0, 0, probe_size, probe_size );
                  else
                    view( 0, 0, probe_size, probe_size );
                  textprintf( screen, font, 1, Yres-0x10, 0xE0, "Re(Z)= %+.18f", cx);
                  textprintf( screen, font, 1, Yres-8, 0xE0, "Im(Z)= %+.18f", cy);
                  mouse_move = mouse_event = 0;
                  while ( !mouse_move && !mouse_event && !bioskey(1) );
                  if ( bioskey(1) )
                  {
                    key = bioskey(0);

                    switch( key )
                    {
                      case 0x186F:     // o
                        orbit_view ^= 1;
                        break;
                      case 0x266C:     // l
                        orbit_pixel ^= 1;
                        break;
                      case 0x1970:     // p
                        pal_gradient ^= 1;
                        break;
                      case 0x3B00:     // F1
                        help();
                        break;
                    }
                  }
                } while ( !mouse_event && !bioskey(1) );

                show_mouse( NULL );
                if ( !mouse_l )
                {
                  iter_function = mandel_iterator;

                  zoom = ozoom;
                  xs = oxs;
                  ys = oys;
                  xe = oxe;
                  ye = oye;
                  xu = oxu;
                  yu = oyu;
                }
                mouse_r = mouse_event = probe_activated = 0;
              }
            }

            if ( bioskey(1) )
            {
              key = bioskey(0);
              if ( key == 0x11B ) break;
              switch( key )
              {
                case 0x3B00:
                  help();
                  continue;
                case 0x1F73:
                  text_mode( -1 );
                  textprintf( screen, font, 1, Yres-17, 0, "Re(Z): <%+.18f, %+.18f)", xs, xe );
                  textprintf( screen, font, 1, Yres-9, 0,  "Im(Z): <%+.18f, %+.18f)", ys, ye );
                  textprintf( screen, font, 1, Yres-15, 0, "Re(Z): <%+.18f, %+.18f)", xs, xe );
                  textprintf( screen, font, 1, Yres-7, 0,  "Im(Z): <%+.18f, %+.18f)", ys, ye );
                  textprintf( screen, font, 0, Yres-16, 0, "Re(Z): <%+.18f, %+.18f)", xs, xe );
                  textprintf( screen, font, 0, Yres-8, 0,  "Im(Z): <%+.18f, %+.18f)", ys, ye );
                  textprintf( screen, font, 2, Yres-16, 0, "Re(Z): <%+.18f, %+.18f)", xs, xe );
                  textprintf( screen, font, 2, Yres-8, 0,  "Im(Z): <%+.18f, %+.18f)", ys, ye );
                  textprintf( screen, font, 1, Yres-16, 0xE0, "Re(Z): <%+.18f, %+.18f)", xs, xe );
                  textprintf( screen, font, 1, Yres-8, 0xE0,  "Im(Z): <%+.18f, %+.18f)", ys, ye );
                  text_mode( 0 );
                  bmp = create_sub_bitmap( screen, 0, 0, Xres, Yres );
                  save_bitmap("snapshot.pcx", bmp, pal);
                  destroy_bitmap( bmp );
                  break;
                case 0x4e2b:  // +
                  rot_forward_pal();
                  break;
                case 0x4a2d:  // -
                  rot_backward_pal();
                  break;
                case 0x2064:  // d
                  set_default_pal();
                  break;
              }
              goto wait;
            }
          } while ( iter_function != julia_iterator );

          clear( screen );
          c = 0;
          timer_enabled = 1;
          break;
        case 0x4900:
          zoom += 0.01;
          break;
        case 0x5100:
          zoom -= 0.01;
          break;
        case 0x011B:
          if ( iter_function == julia_iterator )
          {
            mouse_l = 1;
            timer_enabled = tact = 0;
            goto wait;
          }
          return;
      }
      mouse_event = 0;
      mouse_l = 0;
      mouse_r = 0;
      mouse_m = 0;
      dx = mouse_x;
      dy = mouse_y;
    }

    dx = mouse_x-dx;
    dy = mouse_y-dy;
//    if ( !dx && !dy )
//      c++;

    xr = (xe-xs)/2;
    yr = (ye-ys)/2;
    xc = xs+xr+dx*xu;
    yc = ys+yr+dy*yu;

    xr /= zoom;
    yr /= zoom;

    xs = xc-xr;
    ys = yc-yr;
    xe = xc+xr;
    ye = yc+yr;
  }
}

int main()
{
  allegro_init();
  install_timer();
  install_mouse();
  LOCK_VARIABLE(tact);
  LOCK_VARIABLE(mouse_event);
  LOCK_VARIABLE(timer_enabled);
  LOCK_FUNCTION(timer_handler);
  LOCK_FUNCTION(mouse_handler);

  mouse_callback = mouse_handler;
  iter_function  = mandel_iterator;

  set_gfx_mode( GFX_AUTODETECT, Xres, Yres, 0, 0 );
  set_default_pal();

  install_int( &timer_handler, 100 );
  timer_enabled = 1;

  fly();

  remove_int( &timer_handler );

  allegro_exit();

  return 0;
}
